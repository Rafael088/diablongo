import type { DebateRole, ProviderConfig } from "../types/index.ts";

// MODO GRATIS: la persona no pone key ni elige modelo. La petición solo dice provider: "gratis".
// El SERVIDOR usa su OPENROUTER_API_KEY y elige el modelo de MODELOS_GRATIS; cualquier model o
// apiKey que mande el cliente en este modo se ignora (lib/validarTurno.ts y la ruta).
export const PROVEEDOR_GRATIS = "gratis";

export const MENSAJE_GRATIS_NO_DISPONIBLE = "El modo gratis no está disponible ahora.";

// Verificados el 2026-10-19 en la API pública https://openrouter.ai/api/v1/models (sin key): los 4 existen,
// cuestan 0 y aceptan max_tokens. Solo Gemma 4 anuncia modo de razonamiento «configurable» (apagado por defecto);
// Laguna son modelos de agente/código, pero sin razonamiento obligatorio documentado. Se descartaron los demás
// :free por razonar siempre (nemotron, minimax, inkling, lfm...) o por ser pequeños/de visión sin interés aquí.
// OJO: no he podido probarlos con key; si alguno devuelve vacío con MAX_TOKENS_RESPUESTA = 120, bajarlo de la lista.
//
// Ordenados por preferencia y separados por personaje para que Ángel (pro) y Diablo (con) no hablen con el mismo
// modelo mientras haya alternativa. La ruta usa el primero; el respaldo ante 429 (otra tarea) probará el siguiente
// con elegirModeloGratis(rol, intento).
// Regla: todo ID termina en ":free" (tests/gratis.test.ts lo vigila). Nada de pago.
export const MODELOS_GRATIS: Record<DebateRole, readonly string[]> = {
  pro: ["google/gemma-4-31b-it:free", "poolside/laguna-xs-2.1:free"],
  con: ["google/gemma-4-26b-a4b-it:free", "poolside/laguna-s-2.1:free"],
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
