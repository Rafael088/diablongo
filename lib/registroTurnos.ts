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

// TODO(cotejo-xqsxp8): registro persistente en Upstash Redis (SET debate:indice NX PX)
// para producción. Hasta entonces se usa el de memoria también en producción, que
// en serverless no es global (ver aviso arriba).
let registro: RegistroTurnos = new RegistroTurnosMemoria();

export function obtenerRegistroTurnos(): RegistroTurnos {
  return registro;
}

/** Cambia el registro (pruebas o el de Upstash cuando exista). */
export function usarRegistroTurnos(nuevo: RegistroTurnos): void {
  registro = nuevo;
}
