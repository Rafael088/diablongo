-- Cuentas y créditos de Agent Debate (Supabase).
--
-- Las cuentas son las de Supabase Auth (auth.users: Google y enlace al correo). Aquí solo vive el
-- saldo de créditos y su libro de movimientos. Nadie escribe estas tablas directamente: el saldo
-- se mueve únicamente con las tres funciones de abajo, que el servidor llama con la key secreta.
-- Cada una es atómica (una transacción) e idempotente por referencia:
--   acreditar_compra(usuario, creditos, pago)  → el webhook de Mercado Pago; un pago acredita una sola vez.
--   descontar_debate(usuario, creditos, debate) → al empezar un debate de pago; nunca deja saldo negativo.
--   devolver_debate(usuario, debate)             → si el debate falla; devuelve lo cobrado una sola vez.

-- Saldo actual por persona. Se crea en 0 al registrarse (trigger de abajo).
create table public.saldos (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  creditos integer not null default 0 check (creditos >= 0),
  actualizado_en timestamptz not null default now()
);

-- Libro de movimientos: la historia completa del saldo. (motivo, referencia) es único, y eso es lo
-- que hace idempotentes a las funciones: un webhook repetido o un reintento chocan aquí.
--   compra     → referencia = id del pago de Mercado Pago, delta > 0
--   debate     → referencia = id del debate (el del token firmado), delta < 0
--   devolucion → referencia = id del debate devuelto, delta > 0
--   ajuste     → referencia libre (soporte manual), delta con cualquier signo
create table public.movimientos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  motivo text not null check (motivo in ('compra', 'debate', 'devolucion', 'ajuste')),
  referencia text not null check (length(referencia) between 1 and 200),
  creado_en timestamptz not null default now(),
  unique (motivo, referencia)
);

create index movimientos_usuario_fecha on public.movimientos (usuario_id, creado_en desc);

-- Cada persona ve su saldo y sus movimientos; nadie los escribe desde el navegador.
alter table public.saldos enable row level security;
alter table public.movimientos enable row level security;

create policy "ver mi saldo" on public.saldos
  for select to authenticated using ((select auth.uid()) = usuario_id);

create policy "ver mis movimientos" on public.movimientos
  for select to authenticated using ((select auth.uid()) = usuario_id);

revoke insert, update, delete on public.saldos, public.movimientos from anon, authenticated;

-- Saldo en 0 para cada cuenta nueva.
create function public.crear_saldo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.saldos (usuario_id) values (new.id) on conflict (usuario_id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_saldo();

-- Acredita una compra. Devuelve acreditado = false si ese pago ya se había acreditado (webhook
-- repetido); en ese caso no toca el saldo.
create function public.acreditar_compra(p_usuario uuid, p_creditos integer, p_pago text)
returns table (acreditado boolean, saldo integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saldo integer;
begin
  if p_creditos is null or p_creditos <= 0 then
    raise exception 'creditos_invalidos' using errcode = '22023';
  end if;

  insert into public.movimientos (usuario_id, delta, motivo, referencia)
  values (p_usuario, p_creditos, 'compra', p_pago)
  on conflict (motivo, referencia) do nothing;

  if not found then
    select s.creditos into v_saldo from public.saldos s where s.usuario_id = p_usuario;
    return query select false, coalesce(v_saldo, 0);
    return;
  end if;

  insert into public.saldos as s (usuario_id, creditos) values (p_usuario, p_creditos)
  on conflict (usuario_id) do update
    set creditos = s.creditos + excluded.creditos, actualizado_en = now()
  returning s.creditos into v_saldo;

  return query select true, v_saldo;
end;
$$;

-- Cobra un debate. Si no alcanza el saldo lanza 'saldo_insuficiente' y no deja rastro. Si ese
-- debate ya se cobró (reintento), devuelve cobrado = false sin cobrar otra vez.
create function public.descontar_debate(p_usuario uuid, p_creditos integer, p_debate text)
returns table (cobrado boolean, saldo integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saldo integer;
  v_dueno uuid;
begin
  if p_creditos is null or p_creditos <= 0 then
    raise exception 'creditos_invalidos' using errcode = '22023';
  end if;

  insert into public.movimientos (usuario_id, delta, motivo, referencia)
  values (p_usuario, -p_creditos, 'debate', p_debate)
  on conflict (motivo, referencia) do nothing;

  if not found then
    select m.usuario_id into v_dueno
      from public.movimientos m where m.motivo = 'debate' and m.referencia = p_debate;
    if v_dueno <> p_usuario then
      raise exception 'debate_ajeno' using errcode = '42501';
    end if;
    select s.creditos into v_saldo from public.saldos s where s.usuario_id = p_usuario;
    return query select false, coalesce(v_saldo, 0);
    return;
  end if;

  -- El WHERE con creditos >= p_creditos bloquea la fila: dos debates a la vez no pueden pasar
  -- los dos con saldo para uno solo.
  update public.saldos s
     set creditos = s.creditos - p_creditos, actualizado_en = now()
   where s.usuario_id = p_usuario and s.creditos >= p_creditos
  returning s.creditos into v_saldo;

  if not found then
    -- Deshace también el movimiento insertado arriba (toda la función es una transacción).
    raise exception 'saldo_insuficiente' using errcode = 'P0001';
  end if;

  return query select true, v_saldo;
end;
$$;

-- Devuelve lo cobrado por un debate que falló. devuelto = false si ese debate no se cobró a esta
-- persona o si ya se había devuelto.
create function public.devolver_debate(p_usuario uuid, p_debate text)
returns table (devuelto boolean, saldo integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_monto integer;
  v_saldo integer;
begin
  select -m.delta into v_monto
    from public.movimientos m
   where m.motivo = 'debate' and m.referencia = p_debate and m.usuario_id = p_usuario;

  if v_monto is not null then
    insert into public.movimientos (usuario_id, delta, motivo, referencia)
    values (p_usuario, v_monto, 'devolucion', p_debate)
    on conflict (motivo, referencia) do nothing;

    if found then
      update public.saldos s
         set creditos = s.creditos + v_monto, actualizado_en = now()
       where s.usuario_id = p_usuario
      returning s.creditos into v_saldo;
      return query select true, v_saldo;
      return;
    end if;
  end if;

  select s.creditos into v_saldo from public.saldos s where s.usuario_id = p_usuario;
  return query select false, coalesce(v_saldo, 0);
end;
$$;

-- Solo el servidor (key secreta → rol service_role) mueve créditos.
revoke execute on function public.crear_saldo() from public, anon, authenticated;
revoke execute on function public.acreditar_compra(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.descontar_debate(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.devolver_debate(uuid, text) from public, anon, authenticated;
grant execute on function public.acreditar_compra(uuid, integer, text) to service_role;
grant execute on function public.descontar_debate(uuid, integer, text) to service_role;
grant execute on function public.devolver_debate(uuid, text) to service_role;
