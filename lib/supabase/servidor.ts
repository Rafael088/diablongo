import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { configSupabase } from "./config.ts";

/**
 * Cliente de Supabase con la sesión de la persona (cookies), para Route Handlers y Server
 * Components. Uno nuevo por petición. null si las cuentas no están configuradas.
 */
export async function clienteServidor(): Promise<SupabaseClient | null> {
  const config = configSupabase();
  if (!config) return null;
  const almacen = await cookies();
  return createServerClient(config.url, config.clavePublica, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy ya refresca la sesión.
        }
      },
    },
  });
}
