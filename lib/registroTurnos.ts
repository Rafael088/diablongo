import { obtenerAlmacen, type Almacen } from "./almacen.ts";

/**
 * Registro de turnos ya jugados: impide repetir un mismo (debate, índice) con
 * un token válido. Con él, un token da como mucho TOTAL_LLAMADAS llamadas.
 */
export interface RegistroTurnos {
  /**
   * Marca el turno como usado. true si estaba libre; false si ya se había
   * usado (la ruta responde 409). `expira` (ms) es cuándo caduca el token:
   * pasado ese momento la marca puede borrarse.
   */
  marcar(debateId: string, indice: number, expira?: number): Promise<boolean>;
  /**
   * Devuelve el turno si la llamada al proveedor falló antes de dar respuesta,
   * para que el botón de reintentar siga funcionando.
   */
  liberar(debateId: string, indice: number): Promise<void>;
}

/** Duración por defecto de una marca si no se dice cuándo caduca el token. */
const DURACION_POR_DEFECTO_MS = 60 * 60 * 1000;

/**
 * Implementación en memoria (Map con limpieza por expiración) para development
 * y pruebas. OJO: en serverless (Vercel) cada instancia tiene su propio Map, así
 * que NO es global: alguien podría repetir un índice si cae en otra instancia.
 */
export class RegistroTurnosMemoria implements RegistroTurnos {
  private readonly marcas = new Map<string, number>();
  private proximaLimpieza = 0;

  constructor(private readonly reloj: () => number = Date.now) {}

  private clave(debateId: string, indice: number): string {
    return `${debateId}:${indice}`;
  }

  private limpiar(ahora: number): void {
    if (ahora < this.proximaLimpieza) return;
    for (const [clave, expira] of this.marcas) {
      if (expira <= ahora) this.marcas.delete(clave);
    }
    this.proximaLimpieza = ahora + 60 * 1000;
  }

  async marcar(debateId: string, indice: number, expira?: number): Promise<boolean> {
    const ahora = this.reloj();
    this.limpiar(ahora);
    const clave = this.clave(debateId, indice);
    const existente = this.marcas.get(clave);
    if (existente !== undefined && existente > ahora) return false;
    this.marcas.set(clave, expira ?? ahora + DURACION_POR_DEFECTO_MS);
    return true;
  }

  async liberar(debateId: string, indice: number): Promise<void> {
    this.marcas.delete(this.clave(debateId, indice));
  }

  /** Marcas vivas (solo para pruebas). */
  get tamano(): number {
    return this.marcas.size;
  }
}

/** Registro persistente en Upstash: SET debate:<id>:<indice> 1 NX PX <ms hasta exp>; liberar = DEL. */
export class RegistroTurnosUpstash implements RegistroTurnos {
  constructor(
    private readonly almacen: Almacen,
    private readonly reloj: () => number = () => Date.now()
  ) {}

  private clave(debateId: string, indice: number): string {
    return `debate:${debateId}:${indice}`;
  }

  async marcar(debateId: string, indice: number, expira?: number): Promise<boolean> {
    const ms = (expira ?? this.reloj() + DURACION_POR_DEFECTO_MS) - this.reloj();
    return this.almacen.setNX(this.clave(debateId, indice), Math.max(1, ms));
  }

  async liberar(debateId: string, indice: number): Promise<void> {
    await this.almacen.del(this.clave(debateId, indice));
  }
}

// Si se fijó uno con usarRegistroTurnos se respeta. Si no: con credenciales de Upstash, el
// persistente (global entre instancias); sin ellas, el de memoria (no global en serverless).
let registro: RegistroTurnos | undefined;
let porDefecto: RegistroTurnos | undefined;

export function obtenerRegistroTurnos(): RegistroTurnos {
  if (registro) return registro;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const almacen = obtenerAlmacen();
    if (almacen) return (porDefecto ??= new RegistroTurnosUpstash(almacen));
  }
  return (porDefecto ??= new RegistroTurnosMemoria());
}

/** Cambia el registro (pruebas o uno propio). */
export function usarRegistroTurnos(nuevo: RegistroTurnos): void {
  registro = nuevo;
}
