import { PROVEEDOR_GRATIS } from "./gratis.ts";

// Los tres modos de la pantalla de configuración son excluyentes.
export type ModoConfig = "gratis" | "openrouter" | "key";

export const MODOS: readonly ModoConfig[] = ["gratis", "openrouter", "key"];

export function esModo(valor: unknown): valor is ModoConfig {
  return typeof valor === "string" && (MODOS as readonly string[]).includes(valor);
}

/** «Conectar OpenRouter» (OAuth, tarea cotejo-sah5fs) aún no existe: se ve, pero no se puede usar. */
export const OPENROUTER_DISPONIBLE = false;

interface ConfigGuardada {
  modo?: unknown;
  proProvider?: string;
  conProvider?: string;
}

/**
 * Modo con el que abre la pantalla. Una preferencia guardada manda; si no hay (configs viejas),
 * se deduce de los proveedores guardados y, sin nada guardado, de si ya hay alguna key.
 * Un modo «openrouter» guardado cae a gratis mientras no esté disponible.
 */
export function modoInicial(guardada: ConfigGuardada | null, hayKeys: boolean): ModoConfig {
  const m = guardada?.modo;
  if (esModo(m)) return m === "openrouter" && !OPENROUTER_DISPONIBLE ? "gratis" : m;
  if (guardada?.proProvider || guardada?.conProvider) {
    const alguno = [guardada.proProvider, guardada.conProvider].some((p) => p && p !== PROVEEDOR_GRATIS);
    return alguno ? "key" : "gratis";
  }
  return hayKeys ? "key" : "gratis";
}

/** ¿Se puede pulsar «Iniciar Debate»? */
export function puedeIniciar(opts: {
  modo: ModoConfig;
  tema: string;
  verificado: boolean;
  disponibleOpenRouter?: boolean;
  /** Estado del contador: con cupo agotado, el modo gratis no deja iniciar (el servidor respondería 429). */
  contador?: EstadoContador;
}): boolean {
  if (!opts.tema.trim() || !opts.verificado) return false;
  if (opts.modo === "gratis" && opts.contador?.tipo === "agotado") return false;
  if (opts.modo === "openrouter") return opts.disponibleOpenRouter ?? OPENROUTER_DISPONIBLE;
  return true;
}

/** Proveedor que usa cada debatiente según el modo (en «key» elige la persona; en el resto no hay elección). */
export function proveedorDelModo(modo: ModoConfig, elegido: string): string {
  return modo === "gratis" ? PROVEEDOR_GRATIS : elegido;
}

// ---- Contador de debates que quedan hoy (modo Gratis) ----

export type EstadoContador =
  | { tipo: "cargando" }
  | { tipo: "quedan"; quedan: number; reinicia?: string }
  | { tipo: "agotado"; reinicia?: string }
  | { tipo: "error" };

/** Convierte la respuesta de GET /api/debate/cupo en estado de pantalla. Cualquier rareza es «error». */
export function estadoDeCupo(status: number, cuerpo: unknown): EstadoContador {
  if (status !== 200 || !cuerpo || typeof cuerpo !== "object") return { tipo: "error" };
  const { quedan, reinicia } = cuerpo as { quedan?: unknown; reinicia?: unknown };
  if (typeof quedan !== "number" || !Number.isFinite(quedan)) return { tipo: "error" };
  const r = typeof reinicia === "string" ? reinicia : undefined;
  const n = Math.max(0, Math.floor(quedan));
  return n === 0 ? { tipo: "agotado", reinicia: r } : { tipo: "quedan", quedan: n, reinicia: r };
}

/** Pide el cupo; nunca lanza: un fallo de red o un 5xx es {tipo:"error"}. */
export async function pedirCupo(
  fetcher: typeof fetch = fetch,
  señal?: AbortSignal
): Promise<EstadoContador> {
  try {
    const res = await fetcher("/api/debate/cupo", { cache: "no-store", signal: señal });
    const cuerpo = await res.json().catch(() => null);
    return estadoDeCupo(res.status, cuerpo);
  } catch {
    return { tipo: "error" };
  }
}

/** Texto que ve la persona bajo el selector de modo. */
export function textoContador(e: EstadoContador): string {
  switch (e.tipo) {
    case "cargando":
      return "Mirando cuántos debates te quedan hoy…";
    case "quedan":
      return e.quedan === 1 ? "Te queda 1 debate gratis hoy." : `Te quedan ${e.quedan} debates gratis hoy.`;
    case "agotado":
      return "Hoy ya no te quedan debates gratis. Vuelve mañana o usa tu propia key.";
    case "error":
      return "No pudimos mirar cuántos debates te quedan hoy. Puedes intentar igual.";
  }
}
