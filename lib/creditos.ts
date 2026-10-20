// Créditos: envoltorio de las funciones SQL de supabase/migrations/*_cuentas_creditos.sql.
// Toda la lógica que importa (atómico, sin saldo negativo, una sola vez por referencia) vive en
// Postgres; aquí solo se llama y se traduce el resultado. Usar con clienteAdmin().

/** Lo mínimo de un cliente de Supabase que hace falta: .rpc(nombre, args). */
export interface LlamadorRpc {
  rpc(
    funcion: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export class ErrorCreditos extends Error {
  constructor(mensaje: string, readonly codigo?: string) {
    super(mensaje);
    this.name = "ErrorCreditos";
  }
}

export type ResultadoCobro =
  | { ok: true; cobrado: boolean; saldo: number }
  | { ok: false; motivo: "saldo_insuficiente" };

function fila(data: unknown): Record<string, unknown> {
  const f = Array.isArray(data) ? data[0] : data;
  if (!f || typeof f !== "object") throw new ErrorCreditos("La base no devolvió resultado");
  return f as Record<string, unknown>;
}

function entero(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isInteger(valor)) throw new ErrorCreditos("Saldo inválido");
  return valor;
}

function comprobarCantidad(creditos: number): void {
  if (!Number.isInteger(creditos) || creditos <= 0) throw new ErrorCreditos("Cantidad de créditos inválida");
}

/** Acredita un pago aprobado. acreditado = false si ese pago ya estaba acreditado (webhook repetido). */
export async function acreditarCompra(
  db: LlamadorRpc,
  usuario: string,
  creditos: number,
  pagoId: string
): Promise<{ acreditado: boolean; saldo: number }> {
  comprobarCantidad(creditos);
  const { data, error } = await db.rpc("acreditar_compra", { p_usuario: usuario, p_creditos: creditos, p_pago: pagoId });
  if (error) throw new ErrorCreditos(error.message, error.code);
  const f = fila(data);
  return { acreditado: f.acreditado === true, saldo: entero(f.saldo) };
}

/** Cobra un debate. Sin saldo suficiente no lanza: devuelve { ok: false } para responder 402. */
export async function descontarDebate(
  db: LlamadorRpc,
  usuario: string,
  creditos: number,
  debateId: string
): Promise<ResultadoCobro> {
  comprobarCantidad(creditos);
  const { data, error } = await db.rpc("descontar_debate", { p_usuario: usuario, p_creditos: creditos, p_debate: debateId });
  if (error) {
    if (error.message.includes("saldo_insuficiente")) return { ok: false, motivo: "saldo_insuficiente" };
    throw new ErrorCreditos(error.message, error.code);
  }
  const f = fila(data);
  return { ok: true, cobrado: f.cobrado === true, saldo: entero(f.saldo) };
}

/** Devuelve lo cobrado por un debate que falló. devuelto = false si no se cobró o ya se devolvió. */
export async function devolverDebate(
  db: LlamadorRpc,
  usuario: string,
  debateId: string
): Promise<{ devuelto: boolean; saldo: number }> {
  const { data, error } = await db.rpc("devolver_debate", { p_usuario: usuario, p_debate: debateId });
  if (error) throw new ErrorCreditos(error.message, error.code);
  const f = fila(data);
  return { devuelto: f.devuelto === true, saldo: entero(f.saldo) };
}
