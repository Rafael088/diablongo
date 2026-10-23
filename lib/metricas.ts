import { createHmac } from "node:crypto";
import { obtenerAlmacen, type Almacen } from "./almacen.ts";
import { fechaBogota } from "./limites.ts";
import { obtenerSecreto } from "./tokenDebate.ts";

/**
 * Contadores de uso SIN datos personales (v0.4.0, cotejo-o7aqeg). Cada evento suma 1 a
 * `metricas:<AAAA-MM-DD>:<evento>` (día en hora de Colombia) en Upstash, con caducidad de 120 días.
 * Ni las claves ni los valores llevan IP, id de debate, de reto, de cuenta ni cookies.
 *
 * «Cuántas personas llegan al límite»: además del contador de rechazos, cada rechazo anota en un
 * HyperLogLog (`...:limite_gratis_personas`) un hash HMAC-SHA256 de la IP con un secreto del
 * servidor y la fecha. Un HyperLogLog solo guarda un resumen estadístico: permite contar únicos
 * pero no recuperar ni listar lo que se anotó (ni siquiera el hash), y el hash cambia cada día, así
 * que no se puede seguir a una persona de un día a otro. La IP en claro nunca se guarda.
 */
export const EVENTOS = ["limite_gratis", "debate_creditos", "reto_creado", "reto_abierto", "reto_votado"] as const;
export type EventoMetrica = (typeof EVENTOS)[number];

/** Contador derivado: personas distintas (por día) que chocaron con el límite gratis. */
export const PERSONAS_LIMITE = "limite_gratis_personas";
export type ClaveMetrica = EventoMetrica | typeof PERSONAS_LIMITE;
export const COLUMNAS: readonly ClaveMetrica[] = ["limite_gratis", PERSONAS_LIMITE, "debate_creditos", "reto_creado", "reto_abierto", "reto_votado"];

export const DIAS_CONSERVACION = 120;
const TTL_SEGUNDOS = DIAS_CONSERVACION * 24 * 60 * 60;
const DIA_MS = 24 * 60 * 60 * 1000;

export function claveMetrica(clave: ClaveMetrica, dia: string): string {
  return `metricas:${dia}:${clave}`;
}

function hashPersona(ip: string, dia: string, secreto: Buffer): string {
  return createHmac("sha256", secreto).update(`metricas\0${dia}\0${ip}`, "utf8").digest("hex");
}

/** Suma 1 al evento de hoy. NUNCA lanza: un fallo de Upstash solo se registra. */
export async function contar(
  evento: EventoMetrica,
  almacen: Almacen | null = obtenerAlmacen(),
  ahora: number = Date.now()
): Promise<void> {
  try {
    if (!almacen) return;
    const clave = claveMetrica(evento, fechaBogota(ahora));
    await almacen.incr(clave);
    await almacen.expire(clave, TTL_SEGUNDOS);
  } catch (error) {
    console.error("Métricas error:", error instanceof Error ? error.message : "desconocido");
  }
}

/** Cuenta un rechazo por el límite gratis y anota a la persona (hash de su IP) una vez por día. */
export async function contarLimiteGratis(
  ip: string,
  almacen: Almacen | null = obtenerAlmacen(),
  ahora: number = Date.now(),
  secreto: Buffer | null = obtenerSecreto()
): Promise<void> {
  await contar("limite_gratis", almacen, ahora);
  try {
    if (!almacen || !secreto) return;
    const dia = fechaBogota(ahora);
    const clave = claveMetrica(PERSONAS_LIMITE, dia);
    await almacen.pfadd(clave, hashPersona(ip, dia, secreto));
    await almacen.expire(clave, TTL_SEGUNDOS);
  } catch (error) {
    console.error("Métricas error:", error instanceof Error ? error.message : "desconocido");
  }
}

export interface FilaMetricas {
  dia: string;
  valores: Record<ClaveMetrica, number>;
}

/** Los últimos `dias` días (hoy primero) con cada contador; lo que falta o falla cuenta 0. */
export async function leerMetricas(
  almacen: Almacen,
  dias = 30,
  ahora: number = Date.now()
): Promise<FilaMetricas[]> {
  const fechas = Array.from({ length: dias }, (_, i) => fechaBogota(ahora - i * DIA_MS));
  return Promise.all(
    fechas.map(async (dia) => {
      const pares = await Promise.all(
        COLUMNAS.map(async (c) => {
          try {
            const n = c === PERSONAS_LIMITE ? await almacen.pfcount(claveMetrica(c, dia)) : await almacen.get(claveMetrica(c, dia));
            return [c, n ?? 0] as const;
          } catch {
            return [c, 0] as const;
          }
        })
      );
      return { dia, valores: Object.fromEntries(pares) as Record<ClaveMetrica, number> };
    })
  );
}
