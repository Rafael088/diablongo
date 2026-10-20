import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { claveSecretaSupabase, configSupabase } from "./config.ts";

/**
 * Cliente con la key secreta (rol service_role): el único que puede mover créditos. Solo para el
 * servidor (webhook de Mercado Pago, inicio de un debate de pago). null si falta configuración.
 */
export function clienteAdmin(env: Record<string, string | undefined> = process.env): SupabaseClient | null {
  const config = configSupabase(env);
  const secreta = claveSecretaSupabase(env);
  if (!config || !secreta) return null;
  return createClient(config.url, secreta, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
