// Crear un reto desde el navegador y compartir su enlace (v0.4.0). Sin React: se prueba con Vitest.

export const TITULO_COMPARTIR = "¿Ángel o Diablo?";
export const TEXTO_COMPARTIR = "¿Ángel o Diablo? Vota mi dilema";

export type ResultadoCrearRetoCliente =
  | { ok: true; id: string; ruta: string; creado: boolean }
  | { ok: false; error: string };

const ERROR_GENERICO = "No pudimos crear el reto. Vuelve a intentarlo.";
const ERROR_RED = "No pudimos crear el reto. Revisa tu conexión y vuelve a intentarlo.";
const MENSAJE_POR_ESTADO: Record<number, string> = {
  401: "Entra a tu cuenta para guardar el reto.",
  403: "Solo los debates con créditos de tu cuenta se pueden convertir en reto.",
  409: "Este debate no se puede guardar como reto (no terminó o se devolvió el crédito).",
  503: "Los retos no están disponibles ahora.",
};

/** POST /api/retos con el cuerpo exacto { debate, eleccion }. Nunca lanza. */
export async function crearRetoCliente(
  debate: string,
  eleccion: "pro" | "con",
  llamar: typeof fetch = fetch,
): Promise<ResultadoCrearRetoCliente> {
  try {
    const r = await llamar("/api/retos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debate, eleccion }),
    });
    const cuerpo = (await r.json().catch(() => null)) as { id?: unknown; ruta?: unknown; creado?: unknown; error?: unknown } | null;
    if (r.ok && typeof cuerpo?.id === "string" && typeof cuerpo.ruta === "string") {
      return { ok: true, id: cuerpo.id, ruta: cuerpo.ruta, creado: cuerpo.creado === true };
    }
    const delServidor = typeof cuerpo?.error === "string" && cuerpo.error ? cuerpo.error : undefined;
    return { ok: false, error: delServidor ?? MENSAJE_POR_ESTADO[r.status] ?? ERROR_GENERICO };
  } catch {
    return { ok: false, error: ERROR_RED };
  }
}

export interface EntornoCompartir {
  origen: string;
  share?: (datos: { title: string; text: string; url: string }) => Promise<void>;
  copiar?: (texto: string) => Promise<void>;
}

export type ResultadoCompartir = "compartido" | "cancelado" | "copiado" | "fallo";

export const AVISO_LINK_COPIADO = "Link copiado";
export const AVISO_COMPARTIR_FALLO = "No pudimos compartir ni copiar el link.";

/** Abre «compartir» del celular; sin él (o si falla) copia el link. AbortError = la persona cerró el menú. */
export async function compartirReto(ruta: string, entorno: EntornoCompartir): Promise<ResultadoCompartir> {
  const url = `${entorno.origen}${ruta}`;
  if (entorno.share) {
    try {
      await entorno.share({ title: TITULO_COMPARTIR, text: TEXTO_COMPARTIR, url });
      return "compartido";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelado";
    }
  }
  try {
    if (!entorno.copiar) return "fallo";
    await entorno.copiar(url);
    return "copiado";
  } catch {
    return "fallo";
  }
}

/** Entorno real del navegador. */
export function entornoNavegador(): EntornoCompartir {
  const nav = navigator;
  return {
    origen: location.origin,
    share: typeof nav.share === "function" ? (d) => nav.share(d) : undefined,
    copiar: nav.clipboard?.writeText ? (t) => nav.clipboard.writeText(t) : undefined,
  };
}
