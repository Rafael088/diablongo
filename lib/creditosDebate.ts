import type { DebateRole, ProviderConfig } from "../types/index.ts";

// MODO CRÉDITOS: como el modo gratis, la persona no pone key ni elige modelo (provider: "creditos").
// El SERVIDOR usa su OPENROUTER_API_KEY con modelos de pago, y cada debate cuesta créditos de la
// cuenta: se cobran en /api/debate/start (lib/guardiasInicio.ts) y se devuelven si un turno del
// debate falla (app/api/debate/route.ts).
export const PROVEEDOR_CREDITOS = "creditos";

// Modelos y costo confirmados el 2026-10-22 (tarea cotejo-j9s6uq).
// Precios en la API pública de OpenRouter el 2026-10-20 (USD por millón de tokens, entrada/salida):
//   anthropic/claude-haiku-5.5    0,10 / 0,50
//   google/gemini-3.1-flash-lite  0,25 / 1,50
//   deepseek/deepseek-v4-pro      0,351 / 0,703
// Los tres dejan apagar el razonamiento (lib/openrouter.ts). NO usar modelos con razonamiento
// obligatorio (p. ej. google/gemini-3.8-flash): con el tope corto la frase sale cortada.
// Un debate son 9 llamadas cortas (MAX_TOKENS_RESPUESTA de salida): menos de 2 centavos de dólar.
// Uno distinto por personaje mientras haya alternativa; el siguiente de la lista es el respaldo.
export const MODELOS_CREDITOS: Record<DebateRole, readonly string[]> = {
  pro: ["anthropic/claude-haiku-5.5", "google/gemini-3.1-flash-lite"],
  con: ["google/gemini-3.1-flash-lite", "deepseek/deepseek-v4-pro"],
};

/** Créditos que cuesta un debate completo (8 turnos + desenlace). */
export const CREDITOS_POR_DEBATE = 1;

export function elegirModeloCreditos(rol: DebateRole, intento = 0): string | undefined {
  return MODELOS_CREDITOS[rol][intento];
}

/** Proveedor sintético del modo créditos (no está en `providers`: no tiene catálogo que el cliente elija). */
export const proveedorCreditos: ProviderConfig = {
  id: PROVEEDOR_CREDITOS,
  name: "Con créditos",
  requiresApiKey: false,
  baseUrl: "https://openrouter.ai/api/v1",
  models: [],
};

export const MENSAJE_CREDITOS_SIN_SESION = "Entra a tu cuenta para jugar con créditos.";
export const MENSAJE_CREDITOS_INSUFICIENTES =
  "No te alcanzan los créditos para este debate. Compra más o juega en modo Gratis.";
export const MENSAJE_CREDITOS_NO_DISPONIBLE = "Los debates con créditos no están disponibles ahora.";
export const MENSAJE_CREDITOS_MEZCLA = "Con créditos juegan los dos personajes: no se puede mezclar con otro modo.";
export const MENSAJE_CREDITOS_DEVUELTOS =
  "Los modelos fallaron y el debate no pudo seguir. Te devolvimos el crédito: empieza otro debate.";

/** Aviso corto en la arena cuando el servidor cambió de modelo en mitad de un debate con créditos. */
export const AVISO_RESPALDO_CREDITOS = "Un modelo falló; seguimos con otro.";
