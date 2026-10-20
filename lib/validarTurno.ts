import { FASES } from "../types/index.ts";
import type { DebateMessage, DebatePhase, DebateRole, ProviderConfig } from "../types/index.ts";
import { getProviderById } from "./providers.ts";

export interface DatosTurno {
  topic: string;
  role: DebateRole;
  phase: DebatePhase;
  provider: ProviderConfig;
  model: string;
  apiKey: string;
  history: DebateMessage[];
  intervention?: string;
}

export type ResultadoValidacion =
  | { ok: true; datos: DatosTurno }
  | { ok: false; status: 400; error: string };

const ROLES = ["pro", "con"];
const ROLES_HISTORIAL = ["pro", "con", "user"];

function fallo(error: string): ResultadoValidacion {
  return { ok: false, status: 400, error };
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Valida el cuerpo de /api/debate antes de llamar a ningún proveedor.
 * Los mensajes de error nunca repiten el valor recibido.
 */
export function validarTurno(body: unknown): ResultadoValidacion {
  if (!esObjeto(body)) return fallo("El cuerpo de la petición no es válido.");

  const { topic, role, phase, provider: providerId, model, apiKey, history, intervention } = body;

  if (typeof topic !== "string" || topic.trim() === "") {
    return fallo("Falta el tema del debate.");
  }
  if (typeof role !== "string" || !ROLES.includes(role)) {
    return fallo("El personaje indicado no es válido.");
  }
  if (typeof phase !== "string" || !(FASES as readonly string[]).includes(phase)) {
    return fallo("La fase indicada no es válida.");
  }
  if (typeof providerId !== "string") return fallo("Falta el proveedor.");
  const provider = getProviderById(providerId);
  if (!provider) return fallo("El proveedor indicado no está permitido.");
  if (typeof model !== "string" || !provider.models.includes(model)) {
    return fallo("El modelo indicado no está permitido para ese proveedor.");
  }
  if (apiKey !== undefined && typeof apiKey !== "string") {
    return fallo("La clave de API no es válida.");
  }
  if (provider.requiresApiKey && !apiKey) {
    return fallo("Falta la clave de API de ese proveedor.");
  }

  let historial: DebateMessage[] = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) return fallo("El historial no es válido.");
    for (const m of history) {
      if (
        !esObjeto(m) ||
        typeof m.role !== "string" ||
        !ROLES_HISTORIAL.includes(m.role) ||
        typeof m.content !== "string"
      ) {
        return fallo("El historial contiene un mensaje no válido.");
      }
    }
    historial = history as DebateMessage[];
  }

  if (intervention !== undefined && typeof intervention !== "string") {
    return fallo("La intervención no es válida.");
  }

  return {
    ok: true,
    datos: {
      topic,
      role: role as DebateRole,
      phase: phase as DebatePhase,
      provider,
      model,
      apiKey: typeof apiKey === "string" ? apiKey : "",
      history: historial,
      intervention: intervention as string | undefined,
    },
  };
}
