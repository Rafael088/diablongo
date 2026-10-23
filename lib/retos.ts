import { createHash, randomBytes } from "node:crypto";
import type { DebateRole } from "../types/index.ts";
import type { LlamadorRpc } from "./creditos.ts";

// RETOS (v0.4.0, tarea cotejo-jc9pls): envoltorio de las funciones SQL de
// supabase/migrations/20261023000000_retos.sql. Usar con clienteAdmin(), salvo leerReto, que
// también funciona con la key pública (la función leer_reto es pública y solo lee por id).
//
// De dónde salen las frases: /api/debate guarda con registrarFrase() lo que el servidor generó en
// cada turno de un debate con créditos (tabla debate_frases). crearReto() construye el reto SOLO con
// eso; el navegador solo dice qué personaje eligió (validarEleccion).

export class ErrorRetos extends Error {
  constructor(mensaje: string, readonly codigo?: string) {
    super(mensaje);
    this.name = "ErrorRetos";
  }
}

export const MENSAJE_RETO_SIN_SESION = "Entra a tu cuenta para guardar el reto.";
export const MENSAJE_RETO_NO_DISPONIBLE = "Los retos no están disponibles ahora.";
export const MENSAJE_RETO_SIN_COBRO = "Solo los debates con créditos de tu cuenta se pueden convertir en reto.";
export const MENSAJE_RETO_SIN_TERMINAR = "Este debate no terminó: solo se guardan como reto los debates completos.";
export const MENSAJE_RETO_DEVUELTO = "A este debate se le devolvió el crédito: no se puede guardar como reto.";

/** Largo del id corto público: 10 caracteres base64url (60 bits aleatorios). */
export const LARGO_ID_RETO = 10;
const ID_RETO = /^[A-Za-z0-9_-]{10}$/;
/** Identificador opaco del navegador (cookie): 16..128 caracteres url-safe. */
const VOTANTE = /^[A-Za-z0-9_-]{16,128}$/;
const INTENTOS_ID = 4;

/** Una frase del reto. indice 0..7 = turnos del debate (TURN_PLAN); 8 = desenlace (puede faltar). */
export interface FraseReto {
  indice: number;
  rol: DebateRole;
  texto: string;
}

export interface VotosReto {
  pro: number;
  con: number;
}

/** Lo que ve cualquiera con el enlace /r/<id>. No incluye la cuenta que lo creó. */
export interface RetoPublico {
  id: string;
  tema: string;
  frases: FraseReto[];
  /** ids de lib/personalidades.ts, tal como iban firmados en el token del debate. */
  personalidades: { pro: string; con: string };
  /** Personaje que eligió quien creó el reto. */
  eleccion: DebateRole;
  /** ISO 8601. */
  creadoEn: string;
  votos: VotosReto;
}

/** Fila de la lista de retos de una cuenta (Ajustes). */
export type ResumenReto = Omit<RetoPublico, "frases">;

export type ResultadoCrearReto =
  | { ok: true; id: string; creado: boolean }
  | { ok: false; motivo: "sin_cobro" | "ajeno" | "sin_terminar" | "devuelto" };

export type ResultadoVoto =
  | { ok: true; registrado: boolean; voto: DebateRole; votos: VotosReto }
  | { ok: false; motivo: "no_existe" };

export function generarIdReto(): string {
  return randomBytes(8).toString("base64url").slice(0, LARGO_ID_RETO);
}

export function esIdReto(x: unknown): x is string {
  return typeof x === "string" && ID_RETO.test(x);
}

export function esVotante(x: unknown): x is string {
  return typeof x === "string" && VOTANTE.test(x);
}

/** Identificador nuevo para la cookie del navegador que vota (lo guarda la ruta de votar). */
export function nuevoIdVotante(): string {
  return randomBytes(18).toString("base64url");
}

/** Lo que se guarda del navegador: SHA-256 de su identificador, nunca el valor de la cookie. */
export function huellaVotante(votante: string): string {
  return createHash("sha256").update(`voto\0${votante}`, "utf8").digest("hex");
}

export function validarEleccion(x: unknown): { ok: true; eleccion: DebateRole } | { ok: false; error: string } {
  return x === "pro" || x === "con"
    ? { ok: true, eleccion: x }
    : { ok: false, error: "Elige al Ángel o al Diablo." };
}

function filas(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((f): f is Record<string, unknown> => !!f && typeof f === "object");
  return data && typeof data === "object" ? [data as Record<string, unknown>] : [];
}

function entero(x: unknown): number {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0;
}

function fecha(x: unknown): string {
  const d = x instanceof Date ? x : new Date(String(x));
  return Number.isNaN(d.getTime()) ? String(x) : d.toISOString();
}

function rol(x: unknown): DebateRole {
  return x === "con" ? "con" : "pro";
}

function frasesDe(x: unknown): FraseReto[] {
  const lista = typeof x === "string" ? (JSON.parse(x) as unknown) : x;
  if (!Array.isArray(lista)) return [];
  return lista.map((f: Record<string, unknown>) => ({ indice: entero(f.indice), rol: rol(f.rol), texto: String(f.texto ?? "") }));
}

function resumen(f: Record<string, unknown>): ResumenReto {
  return {
    id: String(f.id),
    tema: String(f.tema),
    personalidades: { pro: String(f.personalidad_pro), con: String(f.personalidad_con) },
    eleccion: rol(f.eleccion),
    creadoEn: fecha(f.creado_en),
    votos: { pro: entero(f.votos_pro), con: entero(f.votos_con) },
  };
}

/**
 * Guarda la frase que el servidor acaba de generar para un turno de un debate con créditos.
 * false si ese turno ya estaba guardado. Lanza ErrorRetos si el debate no se cobró a esa cuenta.
 */
export async function registrarFrase(
  db: LlamadorRpc,
  frase: { usuario: string; debate: string; indice: number; rol: DebateRole; personalidad: string; tema: string; texto: string }
): Promise<boolean> {
  const { data, error } = await db.rpc("registrar_frase", {
    p_usuario: frase.usuario,
    p_debate: frase.debate,
    p_indice: frase.indice,
    p_rol: frase.rol,
    p_personalidad: frase.personalidad,
    p_tema: frase.tema,
    p_texto: frase.texto,
  });
  if (error) throw new ErrorRetos(error.message, error.code);
  const f = filas(data)[0];
  // supabase-js devuelve el boolean suelto; PGlite, una fila { registrar_frase: true }.
  return data === true || f?.registrar_frase === true;
}

/**
 * Crea (o devuelve, si ya existía) el reto de un debate con créditos terminado de esa cuenta.
 * Las frases, el tema y las personalidades salen de lo que guardó el servidor; solo `eleccion`
 * viene del navegador. Reintenta con otro id si el aleatorio chocara con un reto existente.
 */
export async function crearReto(
  db: LlamadorRpc,
  usuario: string,
  debateId: string,
  eleccion: DebateRole,
  generarId: () => string = generarIdReto
): Promise<ResultadoCrearReto> {
  for (let intento = 0; ; intento++) {
    const { data, error } = await db.rpc("crear_reto", {
      p_usuario: usuario,
      p_debate: debateId,
      p_eleccion: eleccion,
      p_id: generarId(),
    });
    if (error) {
      const m = error.message;
      if (m.includes("debate_sin_cobro")) return { ok: false, motivo: "sin_cobro" };
      if (m.includes("debate_ajeno")) return { ok: false, motivo: "ajeno" };
      if (m.includes("debate_sin_terminar")) return { ok: false, motivo: "sin_terminar" };
      if (m.includes("debate_devuelto")) return { ok: false, motivo: "devuelto" };
      // Choque de id (23505): otro reto ya tiene ese id aleatorio, o el mismo debate se creó a la vez.
      if (error.code === "23505" && intento + 1 < INTENTOS_ID) continue;
      throw new ErrorRetos(m, error.code);
    }
    const f = filas(data)[0];
    if (!f || !esIdReto(f.id)) throw new ErrorRetos("La base no devolvió el reto");
    return { ok: true, id: f.id, creado: f.creado === true };
  }
}

/** Reto público por id corto, o null si no existe (o el id no tiene la forma). */
export async function leerReto(db: LlamadorRpc, id: string): Promise<RetoPublico | null> {
  if (!esIdReto(id)) return null;
  const { data, error } = await db.rpc("leer_reto", { p_id: id });
  if (error) throw new ErrorRetos(error.message, error.code);
  const f = filas(data)[0];
  if (!f) return null;
  return { ...resumen(f), frases: frasesDe(f.frases) };
}

/**
 * Voto de un navegador (`votante` = valor de su cookie, ver nuevoIdVotante). Idempotente: si ese
 * navegador ya votó, registrado = false y se devuelve su voto de entonces. Va detrás de Turnstile.
 */
export async function registrarVoto(
  db: LlamadorRpc,
  retoId: string,
  votante: string,
  voto: DebateRole
): Promise<ResultadoVoto> {
  if (!esIdReto(retoId)) return { ok: false, motivo: "no_existe" };
  if (!esVotante(votante)) throw new ErrorRetos("Identificador de navegador inválido");
  if (voto !== "pro" && voto !== "con") throw new ErrorRetos("Voto inválido");
  const { data, error } = await db.rpc("votar_reto", { p_reto: retoId, p_votante: huellaVotante(votante), p_voto: voto });
  if (error) {
    if (error.message.includes("reto_no_existe")) return { ok: false, motivo: "no_existe" };
    throw new ErrorRetos(error.message, error.code);
  }
  const f = filas(data)[0];
  if (!f) throw new ErrorRetos("La base no devolvió el voto");
  return { ok: true, registrado: f.registrado === true, voto: rol(f.voto), votos: { pro: entero(f.votos_pro), con: entero(f.votos_con) } };
}

/** Retos de una cuenta, del más nuevo al más viejo, con sus votos. */
export async function retosDeUsuario(db: LlamadorRpc, usuario: string, limite = 50): Promise<ResumenReto[]> {
  const { data, error } = await db.rpc("retos_de_usuario", { p_usuario: usuario, p_limite: limite });
  if (error) throw new ErrorRetos(error.message, error.code);
  return filas(data).map(resumen);
}
