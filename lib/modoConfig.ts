import { PROVEEDOR_GRATIS } from "./gratis.ts";
import { CREDITOS_POR_DEBATE, PROVEEDOR_CREDITOS } from "./creditosDebate.ts";

// Los modos de la pantalla de configuración son excluyentes. «creditos» solo se ofrece si hay
// cuentas (Supabase configurado): modelos de pago con la key del servidor, cobrados en créditos.
export type ModoConfig = "gratis" | "openrouter" | "key" | "creditos";

export const MODOS: readonly ModoConfig[] = ["gratis", "openrouter", "key", "creditos"];

/** Modo y proveedor que pone el servidor (sin key ni modelo del cliente). */
export function modoDelServidor(modo: ModoConfig): boolean {
  return modo === "gratis" || modo === "creditos";
}

export function esModo(valor: unknown): valor is ModoConfig {
  return typeof valor === "string" && (MODOS as readonly string[]).includes(valor);
}

/** «Conectar OpenRouter» (OAuth PKCE, lib/oauthOpenRouter.ts). */
export const OPENROUTER_DISPONIBLE = true;

interface ConfigGuardada {
  modo?: unknown;
  proProvider?: string;
  conProvider?: string;
}

/**
 * Modo con el que abre la pantalla. Una preferencia guardada manda; si no hay (configs viejas),
 * se deduce de los proveedores guardados y, sin nada guardado, de si ya hay alguna key.
 */
export function modoInicial(guardada: ConfigGuardada | null, hayKeys: boolean, hayCuentas = true): ModoConfig {
  const m = guardada?.modo;
  if (esModo(m)) {
    if (m === "openrouter" && !OPENROUTER_DISPONIBLE) return "gratis";
    if (m === "creditos" && !hayCuentas) return "gratis";
    return m;
  }
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
  /** Hay una key de OpenRouter obtenida por OAuth: sin ella el modo «openrouter» no inicia. */
  conectadoOpenRouter?: boolean;
  /** Estado del contador: con cupo agotado, el modo gratis no deja iniciar (el servidor respondería 429). */
  contador?: EstadoContador;
  /** Créditos de la sesión: número con sesión, null sin sesión, undefined mientras carga (lib/cuenta.ts). */
  creditos?: number | null;
}): boolean {
  if (!opts.tema.trim() || !opts.verificado) return false;
  if (opts.modo === "gratis" && opts.contador?.tipo === "agotado") return false;
  if (opts.modo === "openrouter") return OPENROUTER_DISPONIBLE && (opts.conectadoOpenRouter ?? false);
  // Sin sesión o sin saldo el servidor respondería 401/402: mejor no dejar empezar.
  if (opts.modo === "creditos") return typeof opts.creditos === "number" && opts.creditos >= CREDITOS_POR_DEBATE;
  return true;
}

/**
 * Modo con el que se juega de verdad. «Con créditos» guardado pero sin sesión cae a Gratis (la opción
 * queda bloqueada hasta entrar); mientras la cuenta carga se respeta, para no parpadear.
 */
export function modoEfectivo(modo: ModoConfig, creditos: number | null | undefined): ModoConfig {
  return modo === "creditos" && creditos === null ? "gratis" : modo;
}

/** Proveedor que usa cada debatiente según el modo (en «key» elige la persona; en el resto no hay elección). */
export function proveedorDelModo(modo: ModoConfig, elegido: string): string {
  if (modo === "openrouter") return "openrouter";
  if (modo === "creditos") return PROVEEDOR_CREDITOS;
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
