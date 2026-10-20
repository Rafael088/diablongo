import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { configSupabase } from "./config.ts";

let cliente: SupabaseClient | null = null;

/** Cliente de Supabase del navegador (login y salir). null si las cuentas no están configuradas. */
export function clienteNavegador(): SupabaseClient | null {
  const config = configSupabase();
  if (!config) return null;
  cliente ??= createBrowserClient(config.url, config.clavePublica);
  return cliente;
}
