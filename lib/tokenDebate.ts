import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DebatePhase, DebateRole } from "../types/index.ts";
import { TOTAL_LLAMADAS, TOTAL_TURNS, TURN_PLAN } from "./debateEngine.ts";
import { esObjeto, validarProveedorModelo, validarTema } from "./validarTurno.ts";
import { PROVEEDOR_CREDITOS } from "./creditosDebate.ts";
import { PERSONALIDAD_CLASICA, personalidadDe, validarPersonalidad } from "./personalidades.ts";

/*
 * TOKEN DEL DEBATE: se cuentan debates, no llamadas.
 *
 * POST /api/debate/start valida la configuración y emite un token firmado con
 * HMAC-SHA256 (DEBATE_TOKEN_SECRET). Formato compacto:
 *
 *     base64url(JSON del payload) "." base64url(HMAC-SHA256(secreto, "firma\0" + parte1))
 *
 * Payload (PayloadToken): v (versión), id (UUID del debate), th (HMAC del tema:
 * el tema NUNCA va en claro y no se puede adivinar sin el secreto), pro/con
 * (proveedor y modelo de cada personaje; el modelo es "" en modo gratis), n
 * (llamadas permitidas = TOTAL_LLAMADAS = 8 turnos + 1 desenlace), iat/exp (ms)
 * y, solo en modo créditos, u (UUID de la cuenta que pagó: a quién devolver).
 * Cada personaje lleva además pe (id de su personalidad, lib/personalidades.ts):
 * /api/debate la toma de aquí, nunca del cliente. Un token sin pe (emitido antes
 * de la v0.4.0) juega con la clásica. Nunca lleva la clave de API.
 * Si el debate se empezó con foto (solo créditos, lib/foto.ts), lleva fh: la huella
 * de la descripción de la foto; cada turno tiene que mandar esa misma descripción.
 *
 * El token es reutilizable por sí solo, así que cada turno manda además su
 * `indice` (0..8). /api/debate exige que el índice esté en el plan, que
 * personaje y fase coincidan con TURN_PLAN[indice] (o fase "desenlace" en el 8,
 * con cualquiera de los dos personajes), que tema/proveedor/modelo sean los del
 * token, y marca (debateId, indice) en un RegistroTurnos: un índice ya usado da
 * 409. Así un token da como mucho n llamadas.
 */

export const VERSION_TOKEN = 1;
export const DURACION_TOKEN_MS = 30 * 60 * 1000;
export const MIN_BYTES_SECRETO = 32;
/** Un token legítimo ronda 300 caracteres; más que esto ni se mira. */
export const MAX_LARGO_TOKEN = 1024;
/** Holgura para relojes de instancias distintas al comprobar `iat`. */
const HOLGURA_RELOJ_MS = 60 * 1000;

export const MENSAJE_SIN_SECRETO = "El servidor no puede empezar debates ahora. Inténtalo más tarde.";
export const MENSAJE_TOKEN_FALTA = "Falta el permiso del debate. Empieza el debate de nuevo.";
export const MENSAJE_TOKEN_INVALIDO = "El permiso del debate no es válido. Empieza el debate de nuevo.";
export const MENSAJE_TOKEN_EXPIRADO = "El permiso del debate caducó. Empieza el debate de nuevo.";

export interface ProveedorRol {
  /** id del proveedor */
  pr: string;
  /** modelo ("" en modo gratis: lo decide el servidor) */
  mo: string;
  /** personalidad (id de lib/personalidades.ts); falta en tokens viejos = clásica */
  pe?: string;
}

export interface PayloadToken {
  v: typeof VERSION_TOKEN;
  id: string;
  th: string;
  pro: ProveedorRol;
  con: ProveedorRol;
  n: number;
  iat: number;
  exp: number;
  /** Cuenta que pagó el debate (solo modo créditos). */
  u?: string;
  /** Huella de la descripción de la foto (solo si el debate se empezó con foto). */
  fh?: string;
}

/** Configuración del debate que llega a /start (sin claves). */
export interface ConfigInicio {
  topic: string;
  pro: { provider: string; model: string; personalidad?: string };
  con: { provider: string; model: string; personalidad?: string };
}

// ---------------------------------------------------------------- secreto

let secretoEfimero: Buffer | undefined;

/**
 * Secreto de firma. Sin DEBATE_TOKEN_SECRET (o con menos de 32 bytes) devuelve
 * null y las rutas responden 503; solo en development se inventa uno efímero
 * (cambia al reiniciar el servidor) y se avisa por consola.
 */
export function obtenerSecreto(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const valor = env.DEBATE_TOKEN_SECRET;
  if (valor && Buffer.byteLength(valor, "utf8") >= MIN_BYTES_SECRETO) return Buffer.from(valor, "utf8");
  if (env.NODE_ENV === "development") {
    if (!secretoEfimero) {
      secretoEfimero = randomBytes(48);
      console.warn(
        "[agent-debate] DEBATE_TOKEN_SECRET falta o mide menos de 32 bytes: uso uno efímero solo para development. " +
          "Genera uno con `openssl rand -base64 48` y ponlo en .env.local."
      );
    }
    return secretoEfimero;
  }
  if (valor) console.error("[agent-debate] DEBATE_TOKEN_SECRET mide menos de 32 bytes: no se emiten tokens.");
  return null;
}

// ---------------------------------------------------------------- firma

const B64URL = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function hmac(secreto: Buffer, contexto: string, datos: string): Buffer {
  return createHmac("sha256", secreto).update(`${contexto}\0${datos}`, "utf8").digest();
}

/** Huella del tema ligada al debate: no revela el tema ni se puede adivinar sin el secreto. */
export function huellaTema(secreto: Buffer, debateId: string, topic: string): string {
  return hmac(secreto, "tema", `${debateId}\0${topic}`).toString("base64url");
}

/** Huella de la descripción de la foto, ligada al debate como la del tema. */
export function huellaFoto(secreto: Buffer, debateId: string, descripcion: string): string {
  return hmac(secreto, "foto", `${debateId}\0${descripcion}`).toString("base64url");
}

/** Comparación en tiempo constante de dos cadenas base64url (la longitud no es secreta). */
function igualesSeguro(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function firmarPayload(payload: PayloadToken, secreto: Buffer): string {
  const parte = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${parte}.${hmac(secreto, "firma", parte).toString("base64url")}`;
}

export function emitirToken(
  config: ConfigInicio,
  secreto: Buffer,
  ahora = Date.now(),
  /** id ya elegido (p. ej. el que se cobró en créditos) y cuenta que pagó. */
  opciones: { id?: string; usuario?: string; descripcionFoto?: string } = {}
): { token: string; payload: PayloadToken } {
  const id = opciones.id ?? randomUUID();
  const payload: PayloadToken = {
    v: VERSION_TOKEN,
    id,
    th: huellaTema(secreto, id, config.topic),
    pro: { pr: config.pro.provider, mo: config.pro.model, pe: config.pro.personalidad ?? PERSONALIDAD_CLASICA.pro },
    con: { pr: config.con.provider, mo: config.con.model, pe: config.con.personalidad ?? PERSONALIDAD_CLASICA.con },
    n: TOTAL_LLAMADAS,
    iat: ahora,
    exp: ahora + DURACION_TOKEN_MS,
    ...(opciones.usuario ? { u: opciones.usuario } : {}),
    ...(opciones.descripcionFoto ? { fh: huellaFoto(secreto, id, opciones.descripcionFoto) } : {}),
  };
  return { token: firmarPayload(payload, secreto), payload };
}

function esProveedorRol(x: unknown, rol: DebateRole): x is ProveedorRol {
  return (
    esObjeto(x) &&
    (x.pe === undefined || personalidadDe(rol, x.pe) !== undefined) &&
    typeof x.pr === "string" &&
    x.pr.length > 0 &&
    x.pr.length <= 64 &&
    typeof x.mo === "string" &&
    x.mo.length <= 200
  );
}

function esEntero(x: unknown): x is number {
  return typeof x === "number" && Number.isSafeInteger(x);
}

/** Valida la forma del payload YA verificado antes de usarlo. */
function esPayload(x: unknown): x is PayloadToken {
  return (
    esObjeto(x) &&
    x.v === VERSION_TOKEN &&
    typeof x.id === "string" &&
    UUID.test(x.id) &&
    typeof x.th === "string" &&
    x.th.length === 43 &&
    B64URL.test(x.th) &&
    esProveedorRol(x.pro, "pro") &&
    esProveedorRol(x.con, "con") &&
    esEntero(x.n) &&
    x.n >= 1 &&
    x.n <= TOTAL_LLAMADAS &&
    esEntero(x.iat) &&
    esEntero(x.exp) &&
    x.exp > x.iat &&
    (x.u === undefined || (typeof x.u === "string" && UUID.test(x.u))) &&
    (x.fh === undefined || (typeof x.fh === "string" && x.fh.length === 43 && B64URL.test(x.fh)))
  );
}

export type ResultadoToken =
  | { ok: true; payload: PayloadToken }
  | { ok: false; motivo: "falta" | "invalido" | "expirado"; error: string };

export function verificarToken(token: unknown, secreto: Buffer, ahora = Date.now()): ResultadoToken {
  if (token === undefined || token === null || token === "") {
    return { ok: false, motivo: "falta", error: MENSAJE_TOKEN_FALTA };
  }
  const invalido: ResultadoToken = { ok: false, motivo: "invalido", error: MENSAJE_TOKEN_INVALIDO };
  if (typeof token !== "string" || token.length > MAX_LARGO_TOKEN) return invalido;
  const partes = token.split(".");
  if (partes.length !== 2) return invalido;
  const [parte, firma] = partes;
  if (!B64URL.test(parte) || !B64URL.test(firma)) return invalido;

  // Primero la firma (en tiempo constante); el payload no se lee hasta que es auténtico.
  const esperada = hmac(secreto, "firma", parte);
  if (!igualesSeguro(Buffer.from(firma, "base64url"), esperada)) return invalido;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
  } catch {
    return invalido;
  }
  if (!esPayload(payload)) return invalido;
  if (payload.iat > ahora + HOLGURA_RELOJ_MS) return invalido;
  if (ahora >= payload.exp) return { ok: false, motivo: "expirado", error: MENSAJE_TOKEN_EXPIRADO };
  return { ok: true, payload };
}

// ---------------------------------------------------------------- /start

export type ResultadoInicio = { ok: true; config: ConfigInicio } | { ok: false; error: string };

/**
 * Cuerpo de /api/debate/start: { topic, pro: {provider, model, personalidad?}, con: {...} }.
 * Mismas reglas que cada turno (validarTema y validarProveedorModelo de
 * lib/validarTurno.ts). Las claves de API no se piden ni se guardan aquí.
 * La personalidad (lib/personalidades.ts) falta = clásica; fuera del catálogo o de otro
 * rol, 400; distinta de la clásica solo si ese personaje juega con créditos.
 */
export function validarInicio(body: unknown, ...args: [entorno?: string]): ResultadoInicio {
  if (!esObjeto(body)) return { ok: false, error: "El cuerpo de la petición no es válido." };
  const tema = validarTema(body.topic);
  if (!tema.ok) return tema;
  const roles: Record<DebateRole, { provider: string; model: string; personalidad: string }> = {
    pro: { provider: "", model: "", personalidad: PERSONALIDAD_CLASICA.pro },
    con: { provider: "", model: "", personalidad: PERSONALIDAD_CLASICA.con },
  };
  for (const rol of ["pro", "con"] as const) {
    const d = body[rol];
    if (!esObjeto(d)) return { ok: false, error: "Falta la configuración de un personaje." };
    const prov = validarProveedorModelo(d.provider, d.model, ...args);
    if (!prov.ok) return prov;
    const pe = validarPersonalidad(rol, d.personalidad, prov.provider.id === PROVEEDOR_CREDITOS);
    if (!pe.ok) return pe;
    roles[rol] = { provider: prov.provider.id, model: prov.model, personalidad: pe.id };
  }
  return { ok: true, config: { topic: tema.topic, ...roles } };
}

// ---------------------------------------------------------------- turno

export type ResultadoTurno =
  | { ok: true; indice: number }
  | { ok: false; status: 400 | 403; error: string };

/**
 * ¿Este turno cabe en el debate del token? No consume nada: el registro de
 * índices usados lo lleva RegistroTurnos (lib/registroTurnos.ts).
 */
export function comprobarTurno(
  payload: PayloadToken,
  secreto: Buffer,
  turno: { topic: string; role: DebateRole; phase: DebatePhase; provider: string; model: string; descripcionFoto?: string },
  indice: unknown
): ResultadoTurno {
  if (!esEntero(indice) || indice < 0 || indice >= payload.n) {
    return { ok: false, status: 400, error: "Ese turno no existe en el debate." };
  }
  const plan = TURN_PLAN[indice];
  const encaja =
    indice === TOTAL_TURNS
      ? turno.phase === "desenlace"
      : plan !== undefined && plan.phase === turno.phase && plan.nextSpeaker === turno.role;
  if (!encaja) {
    return { ok: false, status: 400, error: "Ese turno no le toca a ese personaje o no es de esa fase." };
  }

  const th = Buffer.from(huellaTema(secreto, payload.id, turno.topic), "base64url");
  if (!igualesSeguro(th, Buffer.from(payload.th, "base64url"))) {
    return { ok: false, status: 403, error: "Este debate se empezó con otro tema." };
  }
  // Foto: si el debate se empezó con una, cada turno trae su descripción exacta; si no, ninguna.
  if (payload.fh) {
    const fh = Buffer.from(huellaFoto(secreto, payload.id, turno.descripcionFoto ?? ""), "base64url");
    if (!turno.descripcionFoto || !igualesSeguro(fh, Buffer.from(payload.fh, "base64url"))) {
      return { ok: false, status: 403, error: "Este debate se empezó con otra foto." };
    }
  } else if (turno.descripcionFoto) {
    return { ok: false, status: 403, error: "Este debate se empezó sin foto." };
  }
  const delRol = payload[turno.role];
  if (delRol.pr !== turno.provider || delRol.mo !== turno.model) {
    return { ok: false, status: 403, error: "Este debate se empezó con otro proveedor o modelo." };
  }
  return { ok: true, indice };
}

/**
 * Personalidad con la que juega ese personaje, leída del token ya verificado. Sin créditos solo
 * existe la clásica: si un token dijera otra cosa (no debería: /start no lo firma), se rechaza.
 */
export function personalidadDelToken(
  payload: PayloadToken,
  rol: DebateRole
): { ok: true; id: string } | { ok: false; error: string } {
  const delRol = payload[rol];
  return validarPersonalidad(rol, delRol.pe, delRol.pr === PROVEEDOR_CREDITOS);
}
