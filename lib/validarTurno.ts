import { FASES } from "../types/index.ts";
import type { DebateMessage, DebatePhase, DebateRole, ProviderConfig } from "../types/index.ts";
import { getProviderById } from "./providers.ts";
import { PROVEEDOR_GRATIS, proveedorGratis } from "./gratis.ts";
import {
  MAX_INTERVENCION,
  MAX_INTERVENCIONES_USUARIO,
  MAX_MENSAJE_HISTORIAL,
  MAX_MENSAJES_HISTORIAL,
  MAX_TEMA,
} from "./topes.ts";

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
 * `entorno` (opcional) sustituye a process.env.NODE_ENV; sirve para probar.
 */
export function validarTurno(body: unknown, ...args: [entorno?: string]): ResultadoValidacion {
  if (!esObjeto(body)) return fallo("El cuerpo de la petición no es válido.");

  const { topic, role, phase, provider: providerId, model, apiKey, history, intervention } = body;

  if (typeof topic !== "string" || topic.trim() === "") {
    return fallo("Falta el tema del debate.");
  }
  if (topic.trim().length > MAX_TEMA) {
    return fallo(`El tema es demasiado largo (máximo ${MAX_TEMA} caracteres).`);
  }
  if (typeof role !== "string" || !ROLES.includes(role)) {
    return fallo("El personaje indicado no es válido.");
  }
  if (typeof phase !== "string" || !(FASES as readonly string[]).includes(phase)) {
    return fallo("La fase indicada no es válida.");
  }
  if (typeof providerId !== "string") return fallo("Falta el proveedor.");
  // Modo gratis: model y apiKey del cliente se ignoran (ni se validan); el servidor decide ambos.
  const esGratis = providerId === PROVEEDOR_GRATIS;
  const provider = esGratis ? proveedorGratis : getProviderById(providerId, ...args);
  if (!provider) return fallo("El proveedor indicado no está permitido.");
  if (!esGratis) {
    if (typeof model !== "string" || !provider.models.includes(model)) {
      return fallo("El modelo indicado no está permitido para ese proveedor.");
    }
    if (apiKey !== undefined && typeof apiKey !== "string") {
      return fallo("La clave de API no es válida.");
    }
    if (provider.requiresApiKey && !apiKey) {
      return fallo("Falta la clave de API de ese proveedor.");
    }
  }

  let historial: DebateMessage[] = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) return fallo("El historial no es válido.");
    if (history.length > MAX_MENSAJES_HISTORIAL) {
      return fallo(`El historial tiene demasiados mensajes (máximo ${MAX_MENSAJES_HISTORIAL}).`);
    }
    let delUsuario = 0;
    for (const m of history) {
      if (
        !esObjeto(m) ||
        typeof m.role !== "string" ||
        !ROLES_HISTORIAL.includes(m.role) ||
        typeof m.content !== "string"
      ) {
        return fallo("El historial contiene un mensaje no válido.");
      }
      if (m.content.length > MAX_MENSAJE_HISTORIAL) {
        return fallo(`Un mensaje del historial es demasiado largo (máximo ${MAX_MENSAJE_HISTORIAL} caracteres).`);
      }
      if (m.role === "user") delUsuario++;
    }
    if (delUsuario > MAX_INTERVENCIONES_USUARIO) {
      return fallo(`El historial tiene demasiadas intervenciones (máximo ${MAX_INTERVENCIONES_USUARIO}).`);
    }
    historial = history as DebateMessage[];
  }

  if (intervention !== undefined && typeof intervention !== "string") {
    return fallo("La intervención no es válida.");
  }
  if (typeof intervention === "string" && intervention.length > MAX_INTERVENCION) {
    return fallo(`La intervención es demasiado larga (máximo ${MAX_INTERVENCION} caracteres).`);
  }

  return {
    ok: true,
    datos: {
      topic,
      role: role as DebateRole,
      phase: phase as DebatePhase,
      provider,
      model: esGratis ? "" : (model as string),
      apiKey: !esGratis && typeof apiKey === "string" ? apiKey : "",
      history: historial,
      intervention: intervention as string | undefined,
    },
  };
}
