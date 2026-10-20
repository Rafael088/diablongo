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

export function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Tema del debate: texto no vacío y dentro del tope. Error sin repetir el valor. */
export function validarTema(topic: unknown): { ok: true; topic: string } | { ok: false; error: string } {
  if (typeof topic !== "string" || topic.trim() === "") {
    return { ok: false, error: "Falta el tema del debate." };
  }
  if (topic.trim().length > MAX_TEMA) {
    return { ok: false, error: `El tema es demasiado largo (máximo ${MAX_TEMA} caracteres).` };
  }
  return { ok: true, topic };
}

export type ResultadoProveedor =
  | { ok: true; provider: ProviderConfig; model: string; esGratis: boolean }
  | { ok: false; error: string };

/**
 * Proveedor y modelo contra la lista blanca (lib/providers.ts). En modo gratis el
 * modelo del cliente se ignora y se devuelve "" (lo decide el servidor).
 * La usan /api/debate (cada turno) y /api/debate/start (al emitir el token).
 */
export function validarProveedorModelo(
  providerId: unknown,
  model: unknown,
  ...args: [entorno?: string]
): ResultadoProveedor {
  if (typeof providerId !== "string") return { ok: false, error: "Falta el proveedor." };
  const esGratis = providerId === PROVEEDOR_GRATIS;
  const provider = esGratis ? proveedorGratis : getProviderById(providerId, ...args);
  if (!provider) return { ok: false, error: "El proveedor indicado no está permitido." };
  if (esGratis) return { ok: true, provider, model: "", esGratis };
  if (typeof model !== "string" || !provider.models.includes(model)) {
    return { ok: false, error: "El modelo indicado no está permitido para ese proveedor." };
  }
  return { ok: true, provider, model, esGratis };
}

/**
 * Valida el cuerpo de /api/debate antes de llamar a ningún proveedor.
 * Los mensajes de error nunca repiten el valor recibido.
 * `entorno` (opcional) sustituye a process.env.NODE_ENV; sirve para probar.
 */
export function validarTurno(body: unknown, ...args: [entorno?: string]): ResultadoValidacion {
  if (!esObjeto(body)) return fallo("El cuerpo de la petición no es válido.");

  const { topic, role, phase, provider: providerId, model, apiKey, history, intervention } = body;

  const tema = validarTema(topic);
  if (!tema.ok) return fallo(tema.error);
  if (typeof role !== "string" || !ROLES.includes(role)) {
    return fallo("El personaje indicado no es válido.");
  }
  if (typeof phase !== "string" || !(FASES as readonly string[]).includes(phase)) {
    return fallo("La fase indicada no es válida.");
  }
  // Modo gratis: model y apiKey del cliente se ignoran (ni se validan); el servidor decide ambos.
  const prov = validarProveedorModelo(providerId, model, ...args);
  if (!prov.ok) return fallo(prov.error);
  const { provider, esGratis } = prov;
  if (!esGratis) {
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
      topic: tema.topic,
      role: role as DebateRole,
      phase: phase as DebatePhase,
      provider,
      model: prov.model,
      apiKey: !esGratis && typeof apiKey === "string" ? apiKey : "",
      history: historial,
      intervention: intervention as string | undefined,
    },
  };
}
