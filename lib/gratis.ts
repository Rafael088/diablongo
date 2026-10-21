import type { DebateRole, ProviderConfig } from "../types/index.ts";

// MODO GRATIS: la persona no pone key ni elige modelo ni paga. La petición solo dice provider: "gratis".
// El SERVIDOR usa su OPENROUTER_API_KEY y elige el modelo de MODELOS_GRATIS; cualquier model o
// apiKey que mande el cliente en este modo se ignora (lib/validarTurno.ts y la ruta).
export const PROVEEDOR_GRATIS = "gratis";

export const MENSAJE_GRATIS_NO_DISPONIBLE = "El modo gratis no está disponible ahora.";

// «Gratis» es gratis PARA QUIEN JUEGA: el servidor paga. Decisión del 2026-10-21 (cotejo-hv4to6):
// - Los :free de antes (Gemma 4) dieron 429 «rate-limited upstream» en TODAS las pruebas del 20 y 21-oct.
// - Probados en vivo el 21-oct con la key del proyecto (3 llamadas cada uno, prompts del juego, razonamiento
//   apagado): responden Nemotron 3 Ultra, Nemotron 3.5 Lightning, Dots 3 Note y Laguna S; Inkling (403),
//   Nemotron 3 Super (404) y Xing (429) no.
// - Prueba de seguridad con la barrera (docs/seguridad/revision-2026-10-21-gratis.md): Nemotron Ultra y Dots,
//   en el papel del Diablo, empujaban al acto y daban métodos en temas delicados pese al prompt; Gemini 3.1
//   Flash Lite pasó los 8 a mano. Por eso el Diablo va primero con Gemini 3.1 Flash Lite (de pago, barato:
//   ~0,0026 USD por debate; con CUPO_GLOBAL_DIARIO = 111, como mucho ~0,29 USD al día) y el Ángel con Claude
//   Haiku 5.5 (0,10/0,50 USD por millón; el Ángel no tienta). Los :free quedan solo de respaldo ante 429.
// - Los :free del Diablo son menos fiables en seguridad: la revisión de cada frase del Diablo (cotejo-91ekmf)
//   es la barrera para ellos.
// Ordenados por preferencia; Ángel (pro) y Diablo (con) sin modelos en común. La ruta usa el primero y el
// respaldo ante 429/5xx prueba el siguiente con elegirModeloGratis(rol, intento).
// Regla: todo ID es :free o está en MODELOS_PAGO_DEL_SERVIDOR (tests/gratis.test.ts lo vigila).
export const MODELOS_PAGO_DEL_SERVIDOR: readonly string[] = ["anthropic/claude-haiku-5.5", "google/gemini-3.1-flash-lite"];

export const MODELOS_GRATIS: Record<DebateRole, readonly string[]> = {
  pro: ["anthropic/claude-haiku-5.5", "nvidia/nemotron-3-ultra-550b-a55b:free", "poolside/laguna-xs-2.1:free"],
  con: ["google/gemini-3.1-flash-lite", "poolside/laguna-s-2.1:free", "nvidia/nemotron-3.5-lightning:free"],
};

/** Modelo gratis del personaje; `intento` 0 es el preferido, 1 el siguiente (respaldo). undefined si se acabaron. */
export function elegirModeloGratis(rol: DebateRole, intento = 0): string | undefined {
  return MODELOS_GRATIS[rol][intento];
}

/** Proveedor sintético del modo gratis (no está en `providers`: no tiene catálogo que el cliente elija). */
export const proveedorGratis: ProviderConfig = {
  id: PROVEEDOR_GRATIS,
  name: "Gratis",
  requiresApiKey: false,
  baseUrl: "https://openrouter.ai/api/v1",
  models: [],
};

export const MENSAJE_GRATIS_AGOTADO =
  "Los modelos gratis están saturados ahora mismo. Prueba en un rato o usa tu propia key.";

/** Aviso corto que ve la persona en la arena cuando el servidor cambió de modelo. */
export const AVISO_RESPALDO_GRATIS = "Un modelo gratis falló; seguimos con otro.";

/** Fallo de una llamada a un modelo: `status` es el HTTP, y falta si fue un error de red. */
export class ErrorDeModelo extends Error {
  constructor(mensaje: string, readonly status?: number) {
    super(mensaje);
    this.name = "ErrorDeModelo";
  }
}

/** ¿Vale la pena probar con el siguiente modelo? 429, tiempo agotado, 5xx o caída de red. */
export function esFalloDeModelo(error: unknown): boolean {
  if (!(error instanceof ErrorDeModelo)) return false;
  const s = error.status;
  return s === undefined || s === 429 || s === 408 || s >= 500;
}
