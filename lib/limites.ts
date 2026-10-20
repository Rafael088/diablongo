import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { obtenerAlmacen, type Almacen } from "./almacen.ts";
import { TOTAL_LLAMADAS } from "./debateEngine.ts";
import { MENSAJE_GRATIS_NO_DISPONIBLE, PROVEEDOR_GRATIS } from "./gratis.ts";
import { obtenerSecreto } from "./tokenDebate.ts";

/** Límites del modo gratis (configurables por env). El cupo global sale de 1.000 llamadas/día de OpenRouter. */
export const LIMITE_IP_POR_DEFECTO = 3;
export const CUPO_GLOBAL_POR_DEFECTO = Math.floor(1000 / TOTAL_LLAMADAS);

export const MENSAJE_LIMITE_IP =
  "Ya usaste tus 3 debates gratis de hoy. Vuelven mañana a las 00:00 (hora de Colombia), o conecta tu cuenta de OpenRouter o usa tu propia key.";
export const MENSAJE_CUPO_GLOBAL =
  "El modo gratis se acabó por hoy para todos. Vuelve mañana a las 00:00 (hora de Colombia), o conecta tu cuenta de OpenRouter o usa tu propia key.";

const TTL_SEGUNDOS = 48 * 60 * 60;
const ZONA = "America/Bogota";

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return valor && Number.isInteger(n) && n >= 0 ? n : porDefecto;
}

export function limiteIp(env: NodeJS.ProcessEnv = process.env): number {
  return entero(env.LIMITE_IP_DIARIO, LIMITE_IP_POR_DEFECTO);
}
export function cupoGlobal(env: NodeJS.ProcessEnv = process.env): number {
  return entero(env.CUPO_GLOBAL_DIARIO, CUPO_GLOBAL_POR_DEFECTO);
}

/** Fecha local de Bogotá (AAAA-MM-DD) del instante dado. */
export function fechaBogota(ahora: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/** Próxima medianoche de Bogotá (UTC-5 todo el año, sin horario de verano) como ISO con offset. */
export function reinicioBogota(ahora: number = Date.now()): string {
  const [a, m, d] = fechaBogota(ahora).split("-").map(Number);
  const siguiente = new Date(Date.UTC(a, m - 1, d + 1));
  return `${siguiente.toISOString().slice(0, 10)}T00:00:00-05:00`;
}

/** IP del cliente según Vercel: primer valor de x-forwarded-for, si no x-real-ip, si no "desconocida". */
export function ipDe(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  return request.headers.get("x-real-ip")?.trim() || "desconocida";
}

function hashIp(ip: string, secreto: Buffer): string {
  return createHmac("sha256", secreto).update(`ip\0${ip}`, "utf8").digest("hex").slice(0, 32);
}

export function esModoGratis(config: { pro: { provider: string }; con: { provider: string } }): boolean {
  return config.pro.provider === PROVEEDOR_GRATIS || config.con.provider === PROVEEDOR_GRATIS;
}

export type ResultadoCupo =
  | { ok: true; quedan: number; reinicia: string }
  | { ok: false; motivo: "ip" | "global"; status: 429; error: string; quedan: 0; reinicia: string }
  | { ok: false; motivo: "sin-almacen"; status: 503; error: string };

interface Claves {
  ip: string;
  global: string;
}

function clavesDe(request: NextRequest, ahora: number): Claves | null {
  const secreto = obtenerSecreto();
  if (!secreto) return null;
  const dia = fechaBogota(ahora);
  return { ip: `cupo:ip:${dia}:${hashIp(ipDe(request), secreto)}`, global: `cupo:global:${dia}` };
}

const SIN_ALMACEN: ResultadoCupo = { ok: false, motivo: "sin-almacen", status: 503, error: MENSAJE_GRATIS_NO_DISPONIBLE };

function rechazo(motivo: "ip" | "global", ahora: number): ResultadoCupo {
  return {
    ok: false,
    motivo,
    status: 429,
    error: motivo === "ip" ? MENSAJE_LIMITE_IP : MENSAJE_CUPO_GLOBAL,
    quedan: 0,
    reinicia: reinicioBogota(ahora),
  };
}

/** Consulta cuántos debates gratis le quedan a esa IP hoy, sin consumir nada. */
export async function consultarCupo(
  request: NextRequest,
  env: NodeJS.ProcessEnv = process.env,
  ahora: number = Date.now()
): Promise<ResultadoCupo> {
  const almacen = obtenerAlmacen(env);
  const claves = clavesDe(request, ahora);
  if (!almacen || !claves) return SIN_ALMACEN;
  const [usadosIp, usadosGlobal] = await Promise.all([almacen.get(claves.ip), almacen.get(claves.global)]);
  const quedaIp = Math.max(0, limiteIp(env) - (usadosIp ?? 0));
  const quedaGlobal = Math.max(0, cupoGlobal(env) - (usadosGlobal ?? 0));
  if (quedaGlobal <= 0) return rechazo("global", ahora);
  if (quedaIp <= 0) return rechazo("ip", ahora);
  return { ok: true, quedan: Math.min(quedaIp, quedaGlobal), reinicia: reinicioBogota(ahora) };
}

async function incrementar(almacen: Almacen, clave: string): Promise<number> {
  const n = await almacen.incr(clave);
  await almacen.expire(clave, TTL_SEGUNDOS);
  return n;
}

/**
 * Consume un debate gratis. Comprueba primero cupo global y por IP; solo
 * incrementa si ambos pasan, y si una carrera los hace pasar el tope, deshace
 * el incremento (DECR) para que el rechazado no cuente.
 */
export async function consumirCupo(
  request: NextRequest,
  env: NodeJS.ProcessEnv = process.env,
  ahora: number = Date.now()
): Promise<ResultadoCupo> {
  const previo = await consultarCupo(request, env, ahora);
  if (!previo.ok) return previo;
  const almacen = obtenerAlmacen(env)!;
  const claves = clavesDe(request, ahora)!;
  const nGlobal = await incrementar(almacen, claves.global);
  if (nGlobal > cupoGlobal(env)) {
    await almacen.decr(claves.global);
    return rechazo("global", ahora);
  }
  const nIp = await incrementar(almacen, claves.ip);
  if (nIp > limiteIp(env)) {
    await almacen.decr(claves.ip);
    await almacen.decr(claves.global);
    return rechazo("ip", ahora);
  }
  return { ok: true, quedan: Math.max(0, Math.min(limiteIp(env) - nIp, cupoGlobal(env) - nGlobal)), reinicia: reinicioBogota(ahora) };
}
