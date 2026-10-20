// Ayuda de pruebas: firma tokens de debate como lo haría /api/debate/start.
import { vi } from "vitest";
import { TOTAL_TURNS, TURN_PLAN } from "@/lib/debateEngine";
import { PROVEEDOR_GRATIS } from "@/lib/gratis";
import { emitirToken } from "@/lib/tokenDebate";

export const SECRETO_PRUEBA = "secreto-de-pruebas-con-mas-de-32-bytes-0123456789";

/** Índice del plan que corresponde a ese personaje y fase (8 para el desenlace). */
export function indiceDe(role: unknown, phase: unknown): number {
  if (phase === "desenlace") return TOTAL_TURNS;
  const i = TURN_PLAN.findIndex((t) => t.phase === phase && t.nextSpeaker === role);
  return i === -1 ? 0 : i;
}

/** Añade token e índice al cuerpo de un turno; ambos personajes con su proveedor/modelo. */
export function conToken(cuerpo: Record<string, unknown>): Record<string, unknown> {
  const provider = String(cuerpo.provider);
  const model = provider === PROVEEDOR_GRATIS ? "" : String(cuerpo.model);
  const { token } = emitirToken(
    { topic: String(cuerpo.topic), pro: { provider, model }, con: { provider, model } },
    Buffer.from(SECRETO_PRUEBA)
  );
  return { token, indice: indiceDe(cuerpo.role, cuerpo.phase), ...cuerpo };
}

/** Token de Turnstile que usan las pruebas de /start (el fetch de siteverify va simulado). */
export const TURNSTILE_PRUEBA = "token-turnstile-de-prueba";

/** Simula siteverify con éxito y la acción correcta; deja el resto de fetch como esté. Devuelve el mock. */
export function simularTurnstile(respuesta: Record<string, unknown> = { success: true, action: "iniciar-debate" }) {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto-turnstile-de-prueba");
  const mock = vi.fn(async () => new Response(JSON.stringify(respuesta), { status: 200 }));
  vi.stubGlobal("fetch", mock);
  return mock;
}
