-- Retos de Agent Debate (v0.4.0): un debate con créditos que terminó se guarda para que otros lo voten.
--
-- Tres tablas, ninguna se escribe desde el navegador:
--   debate_frases → lo que el SERVIDOR generó en cada turno de un debate con créditos (lo escribe
--                   /api/debate con la key secreta). Es la única fuente de las frases de un reto: nunca
--                   se toman del cuerpo que manda el navegador. Se borran al crear el reto y, si el
--                   reto nunca se crea, a los 7 días (limpieza al empezar otro debate de esa cuenta).
--   retos         → el reto guardado: tema, frases, personalidades, lo que eligió quien lo creó y un id
--                   corto público (10 caracteres url-safe aleatorios, ~60 bits: no se adivina).
--   votos_reto    → un voto por navegador y reto (clave primaria reto + huella del navegador).
--
-- Funciones (security definer, todas atómicas):
--   registrar_frase(...)          → servidor; una vez por (debate, turno); exige que el debate se cobró.
--   crear_reto(usuario, debate, eleccion, id) → servidor; idempotente por debate.
--   leer_reto(id)                 → pública (anon incluido): solo por id corto y sin datos de la cuenta.
--   votar_reto(reto, votante, voto) → servidor (tras Turnstile); idempotente por navegador.
--   retos_de_usuario(usuario, limite) → servidor; los retos de una cuenta con sus votos.

create table public.debate_frases (
  debate_id uuid not null,
  indice smallint not null check (indice between 0 and 8),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol text not null check (rol in ('pro', 'con')),
  personalidad text not null check (length(personalidad) between 1 and 64),
  tema text not null check (length(tema) between 1 and 200),
  texto text not null check (length(texto) between 1 and 2000),
  creado_en timestamptz not null default now(),
  primary key (debate_id, indice),
  -- Turnos 0..7 alternan Ángel (pares) y Diablo (impares), como TURN_PLAN; el 8 (desenlace) es de cualquiera.
  check (indice = 8 or rol = case when indice % 2 = 0 then 'pro' else 'con' end)
);

create index debate_frases_usuario_fecha on public.debate_frases (usuario_id, creado_en);

create table public.retos (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{10}$'),
  debate_id uuid not null unique,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  tema text not null check (length(tema) between 1 and 200),
  -- [{ "indice": 0..8, "rol": "pro"|"con", "texto": "..." }] ordenado por indice; el 8 es el desenlace (puede faltar).
  frases jsonb not null check (jsonb_typeof(frases) = 'array'),
  personalidad_pro text not null check (length(personalidad_pro) between 1 and 64),
  personalidad_con text not null check (length(personalidad_con) between 1 and 64),
  eleccion text not null check (eleccion in ('pro', 'con')),
  creado_en timestamptz not null default now()
);

create index retos_usuario_fecha on public.retos (usuario_id, creado_en desc);

create table public.votos_reto (
  reto_id text not null references public.retos (id) on delete cascade,
  -- SHA-256 en hex del identificador del navegador: el valor de la cookie no se guarda.
  votante text not null check (votante ~ '^[0-9a-f]{64}$'),
  voto text not null check (voto in ('pro', 'con')),
  creado_en timestamptz not null default now(),
  primary key (reto_id, votante)
);

-- RLS: el navegador no lee ni escribe estas tablas. La única excepción: cada persona puede ver sus
-- propios retos. Los retos ajenos solo se leen por id con leer_reto().
alter table public.debate_frases enable row level security;
alter table public.retos enable row level security;
alter table public.votos_reto enable row level security;

create policy "ver mis retos" on public.retos
  for select to authenticated using ((select auth.uid()) = usuario_id);

revoke all on public.debate_frases, public.votos_reto from anon, authenticated;
revoke insert, update, delete, truncate on public.retos from anon, authenticated;

-- Guarda la frase que el servidor generó para un turno de un debate con créditos. Devuelve false si
-- ese turno ya estaba guardado (no lo pisa). Exige que el debate se haya cobrado a esa cuenta y que
-- tema y personalidad no cambien a mitad del debate.
create function public.registrar_frase(
  p_usuario uuid,
  p_debate uuid,
  p_indice integer,
  p_rol text,
  p_personalidad text,
  p_tema text,
  p_texto text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otra record;
begin
  if not exists (
    select 1 from public.movimientos m
     where m.motivo = 'debate' and m.referencia = p_debate::text and m.usuario_id = p_usuario
  ) then
    raise exception 'debate_sin_cobro' using errcode = '42501';
  end if;

  select f.usuario_id, f.tema into v_otra from public.debate_frases f where f.debate_id = p_debate limit 1;
  if found and (v_otra.usuario_id <> p_usuario or v_otra.tema <> p_tema) then
    raise exception 'debate_ajeno' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.debate_frases f
     where f.debate_id = p_debate and f.rol = p_rol and f.personalidad <> p_personalidad
  ) then
    raise exception 'personalidad_distinta' using errcode = '22023';
  end if;

  -- Limpieza acotada: frases de esta cuenta que nunca llegaron a reto.
  if p_indice = 0 then
    delete from public.debate_frases f
     where f.usuario_id = p_usuario and f.creado_en < now() - interval '7 days';
  end if;

  insert into public.debate_frases (debate_id, indice, usuario_id, rol, personalidad, tema, texto)
  values (p_debate, p_indice, p_usuario, p_rol, p_personalidad, p_tema, p_texto)
  on conflict (debate_id, indice) do nothing;
  return found;
end;
$$;

-- Crea el reto de un debate con créditos terminado (los 8 turnos guardados), con las frases que guardó
-- el servidor. Idempotente: si ese debate ya tiene reto devuelve el mismo id con creado = false (la
-- elección no se cambia). p_id lo genera el servidor; si choca con otro reto, falla con 23505 y el
-- servidor reintenta con otro.
create function public.crear_reto(p_usuario uuid, p_debate uuid, p_eleccion text, p_id text)
returns table (id text, creado boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reto record;
  v_turnos integer;
  v_tema text;
  v_pe_pro text;
  v_pe_con text;
  v_frases jsonb;
begin
  if p_eleccion is null or p_eleccion not in ('pro', 'con') then
    raise exception 'eleccion_invalida' using errcode = '22023';
  end if;

  select r.id, r.usuario_id into v_reto from public.retos r where r.debate_id = p_debate;
  if found then
    if v_reto.usuario_id <> p_usuario then
      raise exception 'debate_ajeno' using errcode = '42501';
    end if;
    return query select v_reto.id, false;
    return;
  end if;

  if not exists (
    select 1 from public.movimientos m
     where m.motivo = 'debate' and m.referencia = p_debate::text and m.usuario_id = p_usuario
  ) then
    raise exception 'debate_sin_cobro' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.movimientos m
     where m.motivo = 'devolucion' and m.referencia = p_debate::text
  ) then
    raise exception 'debate_devuelto' using errcode = '22023';
  end if;
  if exists (select 1 from public.debate_frases f where f.debate_id = p_debate and f.usuario_id <> p_usuario) then
    raise exception 'debate_ajeno' using errcode = '42501';
  end if;

  select count(*) into v_turnos from public.debate_frases f where f.debate_id = p_debate and f.indice < 8;
  if v_turnos < 8 then
    raise exception 'debate_sin_terminar' using errcode = '22023';
  end if;

  select f.tema into v_tema from public.debate_frases f where f.debate_id = p_debate and f.indice = 0;
  select f.personalidad into v_pe_pro from public.debate_frases f where f.debate_id = p_debate and f.indice = 0;
  select f.personalidad into v_pe_con from public.debate_frases f where f.debate_id = p_debate and f.indice = 1;
  select jsonb_agg(jsonb_build_object('indice', f.indice, 'rol', f.rol, 'texto', f.texto) order by f.indice)
    into v_frases from public.debate_frases f where f.debate_id = p_debate;

  insert into public.retos (id, debate_id, usuario_id, tema, frases, personalidad_pro, personalidad_con, eleccion)
  values (p_id, p_debate, p_usuario, v_tema, v_frases, v_pe_pro, v_pe_con, p_eleccion);

  -- Ya copiadas al reto: no hace falta guardarlas dos veces.
  delete from public.debate_frases f where f.debate_id = p_debate;

  return query select p_id, true;
end;
$$;

-- Lectura pública de un reto por su id corto, con el conteo de votos. No devuelve la cuenta que lo creó.
create function public.leer_reto(p_id text)
returns table (
  id text,
  tema text,
  frases jsonb,
  personalidad_pro text,
  personalidad_con text,
  eleccion text,
  creado_en timestamptz,
  votos_pro integer,
  votos_con integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.tema, r.frases, r.personalidad_pro, r.personalidad_con, r.eleccion, r.creado_en,
         (select count(*)::integer from public.votos_reto v where v.reto_id = r.id and v.voto = 'pro'),
         (select count(*)::integer from public.votos_reto v where v.reto_id = r.id and v.voto = 'con')
    from public.retos r
   where r.id = p_id;
$$;

-- Registra el voto de un navegador. Un navegador vota una vez por reto: si ya votó devuelve
-- registrado = false y su voto de entonces (no se cambia). Lanza 'reto_no_existe' si no hay reto.
create function public.votar_reto(p_reto text, p_votante text, p_voto text)
returns table (registrado boolean, voto text, votos_pro integer, votos_con integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registrado boolean;
  v_voto text;
begin
  if p_voto is null or p_voto not in ('pro', 'con') then
    raise exception 'voto_invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.retos r where r.id = p_reto) then
    raise exception 'reto_no_existe' using errcode = 'P0002';
  end if;

  insert into public.votos_reto (reto_id, votante, voto) values (p_reto, p_votante, p_voto)
  on conflict (reto_id, votante) do nothing;
  v_registrado := found;

  select v.voto into v_voto from public.votos_reto v where v.reto_id = p_reto and v.votante = p_votante;
  return query select v_registrado, v_voto,
    (select count(*)::integer from public.votos_reto v where v.reto_id = p_reto and v.voto = 'pro'),
    (select count(*)::integer from public.votos_reto v where v.reto_id = p_reto and v.voto = 'con');
end;
$$;

-- Los retos de una cuenta, del más nuevo al más viejo, con sus votos (para Ajustes).
create function public.retos_de_usuario(p_usuario uuid, p_limite integer default 50)
returns table (
  id text,
  tema text,
  personalidad_pro text,
  personalidad_con text,
  eleccion text,
  creado_en timestamptz,
  votos_pro integer,
  votos_con integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.tema, r.personalidad_pro, r.personalidad_con, r.eleccion, r.creado_en,
         (select count(*)::integer from public.votos_reto v where v.reto_id = r.id and v.voto = 'pro'),
         (select count(*)::integer from public.votos_reto v where v.reto_id = r.id and v.voto = 'con')
    from public.retos r
   where r.usuario_id = p_usuario
   order by r.creado_en desc, r.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

-- Solo el servidor (key secreta → service_role) escribe y lista; leer un reto por id es público.
revoke execute on function public.registrar_frase(uuid, uuid, integer, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.crear_reto(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.votar_reto(text, text, text) from public, anon, authenticated;
revoke execute on function public.retos_de_usuario(uuid, integer) from public, anon, authenticated;
revoke execute on function public.leer_reto(text) from public;
grant execute on function public.registrar_frase(uuid, uuid, integer, text, text, text, text) to service_role;
grant execute on function public.crear_reto(uuid, uuid, text, text) to service_role;
grant execute on function public.votar_reto(text, text, text) to service_role;
grant execute on function public.retos_de_usuario(uuid, integer) to service_role;
grant execute on function public.leer_reto(text) to anon, authenticated, service_role;
