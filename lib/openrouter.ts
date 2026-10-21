// Llamadas de chat a OpenRouter (y APIs compatibles): cuerpo de la petición y lectura de la respuesta.
// Lo usan app/api/debate/route.ts y scripts/seguridad/correr.ts, para que la prueba de seguridad mida
// exactamente lo mismo que ve quien juega. Funciones puras.
//
// RAZONAMIENTO: en OpenRouter `max_tokens` incluye los tokens de razonamiento. Con el tope corto de
// MAX_TOKENS_RESPUESTA, un modelo que razona se gasta el presupuesto pensando y la frase sale cortada
// («¡Devóralo») o vacía. Medido el 2026-10-20 con max_tokens 120: google/gemini-3.8-flash razonó 111 de
// 116 tokens; openai/gpt-6-luna, 42 de 80 por defecto. Por eso se pide `reasoning: { enabled: false }`
// (los modelos que no razonan lo ignoran). Los de razonamiento OBLIGATORIO responden 400; para esos se
// reintenta sin el parámetro y con más margen (TOPE_CON_RAZONAMIENTO), y lo que salga se recorta.

import { MAX_TOKENS_RESPUESTA } from "./topes.ts";

/** Tope para un modelo que no deja apagar el razonamiento: la longitud la sigue mandando el prompt. */
export const TOPE_CON_RAZONAMIENTO = MAX_TOKENS_RESPUESTA * 5;

export function esOpenRouter(baseUrl: string): boolean {
  return baseUrl.includes("openrouter.ai");
}

export function cuerpoChat(opts: {
  modelo: string;
  system: string;
  user: string;
  /** Solo OpenRouter entiende `reasoning`; Groq u Ollama no lo reciben. */
  openRouter: boolean;
  /** true tras un 400 «Reasoning is mandatory»: sin el parámetro y con más margen. */
  razonamientoObligatorio?: boolean;
}): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    model: opts.modelo,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: 0.7,
    max_tokens: opts.razonamientoObligatorio ? TOPE_CON_RAZONAMIENTO : MAX_TOKENS_RESPUESTA,
  };
  if (opts.openRouter && !opts.razonamientoObligatorio) cuerpo.reasoning = { enabled: false };
  return cuerpo;
}

/** ¿El 400 es porque el modelo no deja apagar el razonamiento? */
export function esRazonamientoObligatorio(status: number, texto: string): boolean {
  return status === 400 && /reasoning is mandatory/i.test(texto);
}

const MIN_PALABRAS = 3;
// Fin de frase: . ! ? … seguido opcionalmente de comillas, paréntesis o emojis de cierre.
const FIN_DE_FRASE = /[.!?…]["'»”)\]]*(?=\s|$)/g;

/**
 * Texto de la respuesta listo para mostrar, o null si no sirve (vacía, o cortada sin ninguna frase
 * completa de al menos 3 palabras). Si el modelo paró por longitud, se queda con las frases completas.
 */
export function textoUtil(contenido: unknown, finishReason: unknown): string | null {
  const texto = typeof contenido === "string" ? contenido.trim() : "";
  if (!texto) return null;
  if (finishReason !== "length") return texto;

  let corte = -1;
  for (const m of texto.matchAll(FIN_DE_FRASE)) corte = (m.index ?? 0) + m[0].length;
  if (corte === -1) return null;
  const recortado = texto.slice(0, corte).trim();
  return recortado.split(/\s+/).length >= MIN_PALABRAS ? recortado : null;
}

/** Lo mínimo de la respuesta de /chat/completions. */
export interface RespuestaChat {
  choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
}

export function leerRespuesta(datos: RespuestaChat): string | null {
  const c = datos.choices?.[0];
  return textoUtil(c?.message?.content, c?.finish_reason);
}
