// Conexión con OpenRouter por OAuth PKCE, todo en el navegador: la key que devuelve es de la
// persona y no pasa por ningún servidor propio. Doc: https://openrouter.ai/docs/use-cases/oauth-pkce

export const URL_AUTORIZAR = "https://openrouter.ai/auth";
export const URL_CANJE = "https://openrouter.ai/api/v1/auth/keys";
export const CLAVE_VERIFIER = "agent-debate-oauth-verifier";
/** Proveedor bajo el que se guarda la key obtenida (lib/keys.ts). */
export const PROVEEDOR_OAUTH = "openrouter";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Verifier aleatorio de 43 caracteres (32 bytes en base64url), dentro de lo que pide RFC 7636. */
export function generarVerifier(cripto: Pick<Crypto, "getRandomValues"> = crypto): string {
  return base64url(cripto.getRandomValues(new Uint8Array(32)));
}

/** code_challenge = base64url(SHA-256(verifier)). */
export async function calcularChallenge(
  verifier: string,
  sutil: Pick<SubtleCrypto, "digest"> = crypto.subtle
): Promise<string> {
  const hash = await sutil.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(hash));
}

export function construirUrlAutorizacion(callbackUrl: string, challenge: string): string {
  const q = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${URL_AUTORIZAR}?${q.toString()}`;
}

/** Dirección a la que OpenRouter devuelve a la persona: la página actual, sin query ni hash. */
export function urlDeVuelta(loc: Pick<Location, "origin" | "pathname">): string {
  return `${loc.origin}${loc.pathname}`;
}

/** Guarda el verifier y devuelve la URL de OpenRouter a la que hay que ir. */
export async function iniciarConexion(
  loc: Pick<Location, "origin" | "pathname">,
  sesion: Pick<Storage, "setItem">
): Promise<string> {
  const verifier = generarVerifier();
  const challenge = await calcularChallenge(verifier);
  sesion.setItem(CLAVE_VERIFIER, verifier);
  return construirUrlAutorizacion(urlDeVuelta(loc), challenge);
}

export type ResultadoCanje = { ok: true; key: string } | { ok: false; error: string };

/** Cambia el code por la key. Nunca lanza ni deja la key (ni el code) en el mensaje de error. */
export async function canjearCodigo(
  code: string,
  verifier: string | null,
  fetcher: typeof fetch = fetch
): Promise<ResultadoCanje> {
  if (!verifier) {
    return {
      ok: false,
      error: "No pudimos terminar la conexión: se perdió el paso de seguridad. Vuelve a pulsar «Conectar con OpenRouter».",
    };
  }
  try {
    const res = await fetcher(URL_CANJE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `OpenRouter no aceptó la conexión (error ${res.status}). Vuelve a intentarlo; el código solo sirve una vez.`,
      };
    }
    const cuerpo = (await res.json().catch(() => null)) as { key?: unknown } | null;
    if (!cuerpo || typeof cuerpo.key !== "string" || cuerpo.key === "") {
      return { ok: false, error: "OpenRouter respondió algo inesperado. Vuelve a intentarlo." };
    }
    return { ok: true, key: cuerpo.key };
  } catch {
    return { ok: false, error: "No pudimos hablar con OpenRouter. Revisa tu conexión y vuelve a intentarlo." };
  }
}

// Códigos ya enviados a canjear en esta carga de página: el modo estricto de React ejecuta los
// efectos dos veces y el code solo sirve una.
const enCurso = new Map<string, Promise<ResultadoCanje>>();

/**
 * Si la URL trae ?code=, lo canjea (una sola vez por code) y limpia la URL y el verifier.
 * Devuelve null si no hay nada que canjear.
 */
export function procesarVuelta(
  loc: Pick<Location, "search" | "pathname" | "hash">,
  sesion: Pick<Storage, "getItem" | "removeItem">,
  limpiarUrl: (nueva: string) => void,
  fetcher: typeof fetch = fetch
): Promise<ResultadoCanje> | null {
  const params = new URLSearchParams(loc.search);
  const code = params.get("code");
  if (!code) return null;
  params.delete("code");
  const resto = params.toString();
  const limpia = `${loc.pathname}${resto ? `?${resto}` : ""}${loc.hash}`;

  // La URL se limpia al terminar (no antes): así la segunda ejecución del efecto en modo estricto
  // todavía ve el code y recibe la misma promesa en vez de creer que no hay nada que canjear.
  const previo = enCurso.get(code);
  if (previo) return previo;
  const verifier = sesion.getItem(CLAVE_VERIFIER);
  sesion.removeItem(CLAVE_VERIFIER);
  const p = canjearCodigo(code, verifier, fetcher).finally(() => limpiarUrl(limpia));
  enCurso.set(code, p);
  return p;
}
