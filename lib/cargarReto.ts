import { cache } from "react";
import { connection } from "next/server";
import { esIdReto, leerReto, type RetoPublico } from "./retos.ts";
import { clienteAdmin } from "./supabase/admin.ts";

export type CargaReto =
  | { estado: "ok"; reto: RetoPublico }
  | { estado: "no_existe" }
  /** Sin Supabase configurado o la base no respondió. */
  | { estado: "no_disponible" };

/**
 * Lee el reto para la página /r/<id>, su metadata y su imagen de Open Graph. Una sola lectura por
 * petición (React cache). Solo servidor: usa la key secreta (clienteAdmin). Los errores de la base se
 * vuelven "no_disponible" (la página lo dice con un aviso) en vez de romper la página.
 */
export const cargarReto = cache(async (id: string): Promise<CargaReto> => {
  // Siempre en la petición, nunca en un prerender: sin esto Next empieza la lectura durante el
  // prerender, la corta al terminarlo y el catch de abajo la tomaría por «base caída».
  await connection();
  if (!esIdReto(id)) return { estado: "no_existe" };
  const db = clienteAdmin();
  if (!db) return { estado: "no_disponible" };
  try {
    const reto = await leerReto(db, id);
    return reto ? { estado: "ok", reto } : { estado: "no_existe" };
  } catch (error) {
    console.error("Reto no disponible:", error instanceof Error ? error.message : "desconocido");
    return { estado: "no_disponible" };
  }
});
