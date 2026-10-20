import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { LlamadorRpc } from "@/lib/creditos";

// La migración de verdad sobre un Postgres de verdad (PGlite, en WASM). Lo que Supabase pone por su
// cuenta —el esquema auth, auth.uid(), los roles y sus permisos por defecto— se imita aquí.
const IMITAR_SUPABASE = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const carpeta = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));

export const ANA = "11111111-1111-4111-8111-111111111111";
export const BETO = "22222222-2222-4222-8222-222222222222";

export interface BaseDePrueba {
  pg: PGlite;
  /** Lo mismo que hace supabase.rpc(): llamar a la función con argumentos con nombre. */
  db: LlamadorRpc;
  como(rol: "service_role" | "authenticated" | "anon", sub?: string): Promise<void>;
  /** Deja solo a Ana y a Beto, con saldo 0, y vuelve al rol service_role. */
  reiniciar(): Promise<void>;
  saldo(usuario: string): Promise<number>;
  movimientos(usuario: string): Promise<number>;
}

export async function crearBaseDePrueba(): Promise<BaseDePrueba> {
  const pg = new PGlite();
  await pg.exec(IMITAR_SUPABASE);
  for (const m of readdirSync(carpeta).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(carpeta + m, "utf8"));
  }

  const como: BaseDePrueba["como"] = async (rol, sub) => {
    await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false); set role ${rol};`);
  };

  const db: LlamadorRpc = {
    async rpc(funcion, args) {
      const nombres = Object.keys(args);
      const sql = `select * from public.${funcion}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(", ")})`;
      try {
        const r = await pg.query(sql, Object.values(args));
        return { data: r.rows, error: null };
      } catch (e) {
        const err = e as { message: string; code?: string };
        return { data: null, error: { message: err.message, code: err.code } };
      }
    },
  };

  return {
    pg,
    db,
    como,
    async reiniciar() {
      await pg.exec(`reset role; truncate public.movimientos, public.saldos; delete from auth.users;`);
      await pg.query("insert into auth.users (id, email) values ($1, 'ana@ejemplo.co'), ($2, 'beto@ejemplo.co')", [ANA, BETO]);
      await como("service_role");
    },
    async saldo(usuario) {
      await como("service_role");
      const r = await pg.query<{ creditos: number }>("select creditos from public.saldos where usuario_id = $1", [usuario]);
      return r.rows[0]?.creditos ?? -1;
    },
    async movimientos(usuario) {
      await como("service_role");
      const r = await pg.query<{ n: number }>("select count(*)::int as n from public.movimientos where usuario_id = $1", [usuario]);
      return r.rows[0].n;
    },
  };
}
