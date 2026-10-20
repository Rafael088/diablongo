/**
 * Verificación de Cloudflare Turnstile en el servidor (cotejo-59jo58).
 * Se usa desde guardiaTurnstile (lib/guardiasInicio.ts). El secreto nunca sale de aquí.
 */
export const ACCION_TURNSTILE = "iniciar-debate";
export const URL_SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TIEMPO_MAX_SITEVERIFY_MS = 5000;
/** Un token de Turnstile real mide ~1 KB; más de esto no es un token. */
const MAX_TOKEN_TURNSTILE = 2048;

export const MENSAJE_TURNSTILE_RECHAZADO =
  "No pudimos comprobar que eres una persona. Recarga la página e inténtalo de nuevo.";
export const MENSAJE_TURNSTILE_SIN_CONFIGURAR = "El servidor no está bien configurado.";
export const MENSAJE_TURNSTILE_RED =
  "No pudimos contactar con el servicio de verificación. Inténtalo de nuevo en unos segundos.";

export type ResultadoTurnstile =
  | { ok: true }
  | { ok: false; status: 403 | 503; error: string };

type Entorno = Record<string, string | undefined>;

/**
 * Comprueba el token de Turnstile contra siteverify. Nunca deja pasar ante la duda:
 * sin secreto en producción, error de red, timeout o respuesta rara → rechazo.
 * Solo en `next dev` sin secreto se omite (con aviso).
 */
export async function verificarTurnstile(
  token: unknown,
  ip: string | null,
  env: Entorno = process.env
): Promise<ResultadoTurnstile> {
  const secreto = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secreto) {
    if (env.NODE_ENV === "development") {
      console.warn("Turnstile: sin TURNSTILE_SECRET_KEY, se omite la verificación (solo en desarrollo).");
      return { ok: true };
    }
    console.error("Turnstile: falta TURNSTILE_SECRET_KEY.");
    return { ok: false, status: 503, error: MENSAJE_TURNSTILE_SIN_CONFIGURAR };
  }

  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_TURNSTILE) {
    return { ok: false, status: 403, error: MENSAJE_TURNSTILE_RECHAZADO };
  }

  const form = new URLSearchParams({ secret: secreto, response: token });
  if (ip && ip !== "desconocida") form.set("remoteip", ip);

  let datos: unknown;
  try {
    const respuesta = await fetch(URL_SITEVERIFY, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIEMPO_MAX_SITEVERIFY_MS),
    });
    if (!respuesta.ok) throw new Error(`siteverify ${respuesta.status}`);
    datos = await respuesta.json();
  } catch (error) {
    console.error("Turnstile: siteverify no respondió:", error instanceof Error ? error.name : "desconocido");
    return { ok: false, status: 503, error: MENSAJE_TURNSTILE_RED };
  }

  const r = (typeof datos === "object" && datos !== null ? datos : {}) as Record<string, unknown>;
  if (r.success !== true) return { ok: false, status: 403, error: MENSAJE_TURNSTILE_RECHAZADO };
  // Con las claves de PRUEBA de Cloudflare la respuesta no trae `action` y marca
  // metadata.result_with_testing_key; esa marca depende solo del secreto (no del cliente).
  const meta = r.metadata as Record<string, unknown> | undefined;
  if (meta?.result_with_testing_key === true) return { ok: true };
  if (r.action !== ACCION_TURNSTILE) return { ok: false, status: 403, error: MENSAJE_TURNSTILE_RECHAZADO };
  const hostname = env.TURNSTILE_HOSTNAME?.trim();
  if (hostname && r.hostname !== hostname) return { ok: false, status: 403, error: MENSAJE_TURNSTILE_RECHAZADO };
  return { ok: true };
}
