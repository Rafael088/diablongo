import { Redis } from "@upstash/redis";

/**
 * Almacén clave-valor con las pocas operaciones de Redis que usamos (límites
 * diarios y registro de turnos). En producción es Upstash Redis (REST); en
 * development/pruebas, una implementación en memoria equivalente.
 */
export interface Almacen {
  get(clave: string): Promise<number | null>;
  /** INCR: crea la clave en 0 si no existe y devuelve el valor nuevo. */
  incr(clave: string): Promise<number>;
  decr(clave: string): Promise<number>;
  /** EXPIRE: caduca la clave en `segundos`. */
  expire(clave: string, segundos: number): Promise<void>;
  /** SET clave 1 NX PX ms: true si la creó, false si ya existía. */
  setNX(clave: string, ms: number): Promise<boolean>;
  del(clave: string): Promise<void>;
}

export class AlmacenMemoria implements Almacen {
  private readonly datos = new Map<string, { valor: number; expira?: number }>();

  constructor(private readonly reloj: () => number = () => Date.now()) {}

  private vivo(clave: string) {
    const d = this.datos.get(clave);
    if (d && d.expira !== undefined && d.expira <= this.reloj()) {
      this.datos.delete(clave);
      return undefined;
    }
    return d;
  }

  async get(clave: string): Promise<number | null> {
    return this.vivo(clave)?.valor ?? null;
  }
  async incr(clave: string): Promise<number> {
    const d = this.vivo(clave) ?? { valor: 0 };
    d.valor += 1;
    this.datos.set(clave, d);
    return d.valor;
  }
  async decr(clave: string): Promise<number> {
    const d = this.vivo(clave) ?? { valor: 0 };
    d.valor -= 1;
    this.datos.set(clave, d);
    return d.valor;
  }
  async expire(clave: string, segundos: number): Promise<void> {
    const d = this.vivo(clave);
    if (d) d.expira = this.reloj() + segundos * 1000;
  }
  async setNX(clave: string, ms: number): Promise<boolean> {
    if (this.vivo(clave)) return false;
    this.datos.set(clave, { valor: 1, expira: this.reloj() + ms });
    return true;
  }
  async del(clave: string): Promise<void> {
    this.datos.delete(clave);
  }

  /** Claves vivas (solo para pruebas). */
  claves(): string[] {
    return [...this.datos.keys()].filter((k) => this.vivo(k));
  }
}

export class AlmacenUpstash implements Almacen {
  private readonly redis: Redis;
  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }
  async get(clave: string): Promise<number | null> {
    const v = await this.redis.get<number | string>(clave);
    return v === null || v === undefined ? null : Number(v);
  }
  incr(clave: string): Promise<number> {
    return this.redis.incr(clave);
  }
  decr(clave: string): Promise<number> {
    return this.redis.decr(clave);
  }
  async expire(clave: string, segundos: number): Promise<void> {
    await this.redis.expire(clave, segundos);
  }
  async setNX(clave: string, ms: number): Promise<boolean> {
    const r = await this.redis.set(clave, 1, { nx: true, px: Math.max(1, Math.ceil(ms)) });
    return r === "OK";
  }
  async del(clave: string): Promise<void> {
    await this.redis.del(clave);
  }
}

let actual: Almacen | null | undefined;
let avisado = false;

/** Fija el almacén (pruebas). `undefined` vuelve a decidir según el entorno. */
export function usarAlmacen(nuevo: Almacen | null | undefined): void {
  actual = nuevo;
}

/**
 * Almacén según el entorno. Con UPSTASH_REDIS_REST_URL/TOKEN: Upstash. Sin ellas:
 * memoria (con aviso) fuera de producción, y null en producción (no se puede
 * limitar sin almacén: el modo gratis responde 503).
 */
export function obtenerAlmacen(env: NodeJS.ProcessEnv = process.env): Almacen | null {
  if (actual !== undefined) return actual;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    actual = new AlmacenUpstash(url, token);
    return actual;
  }
  if (env.NODE_ENV === "production") return null;
  if (!avisado) {
    avisado = true;
    console.warn(
      "[diablongo] Faltan UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN: uso un almacén en memoria solo para development (no es global ni persistente)."
    );
  }
  actual = new AlmacenMemoria();
  return actual;
}

export function almacenDisponible(env: NodeJS.ProcessEnv = process.env): boolean {
  return obtenerAlmacen(env) !== null;
}
