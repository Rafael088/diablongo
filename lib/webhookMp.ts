// Webhook de Mercado Pago: verificar la firma y decidir qué hacer con un pago. Lógica pura.
//
// Firma (igual que WebhookSignatureValidator del SDK oficial `mercadopago` 3.6):
//   x-signature: ts=<segundos>,v1=<hmac hex>
//   manifiesto:  id:<data.id de la query>;request-id:<x-request-id>;ts:<ts>;   (se omite lo que falte)
//   v1 = HMAC-SHA256(clave secreta del webhook, manifiesto) en hex minúscula
import { createHmac, timingSafeEqual } from "node:crypto";
import { paquetePorId, type Paquete } from "./paquetes.ts";

export function manifiestoFirma(dataId: string | undefined, requestId: string | undefined, ts: string): string {
  const partes: string[] = [];
  if (dataId) partes.push(`id:${dataId}`);
  if (requestId) partes.push(`request-id:${requestId}`);
  partes.push(`ts:${ts}`);
  return partes.join(";") + ";";
}

function leerCabeceraFirma(cabecera: string): { ts?: string; v1?: string } {
  const r: { ts?: string; v1?: string } = {};
  for (const parte of cabecera.split(",")) {
    const i = parte.indexOf("=");
    if (i === -1) continue;
    const clave = parte.slice(0, i).trim().toLowerCase();
    const valor = parte.slice(i + 1).trim();
    if (clave === "ts" && valor) r.ts = valor;
    if (clave === "v1" && valor) r.v1 = valor;
  }
  return r;
}

const limpio = (v: string | null | undefined): string | undefined => v?.trim() || undefined;

/** ¿La notificación la firmó Mercado Pago con nuestra clave? Comparación en tiempo constante. */
export function firmaValida(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secreto: string;
}): boolean {
  const cabecera = limpio(opts.xSignature);
  if (!cabecera || !opts.secreto) return false;
  const { ts, v1 } = leerCabeceraFirma(cabecera);
  if (!ts || !/^\d+$/.test(ts) || !v1) return false;
  const esperado = createHmac("sha256", opts.secreto)
    .update(manifiestoFirma(limpio(opts.dataId), limpio(opts.xRequestId), ts))
    .digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee la external_reference `usuario:paquete:uuid` que pone lib/pagos.ts al crear la preferencia. */
export function leerReferencia(ref: unknown): { usuario: string; paquete: Paquete } | null {
  if (typeof ref !== "string") return null;
  const [usuario, paqueteId, intento, ...resto] = ref.split(":");
  if (resto.length || !usuario || !intento || !UUID.test(usuario) || !UUID.test(intento)) return null;
  const paquete = paquetePorId(paqueteId);
  return paquete ? { usuario: usuario.toLowerCase(), paquete } : null;
}

/** Lo que importa de GET /v1/payments/{id}. */
export interface PagoMp {
  id?: unknown;
  status?: unknown;
  external_reference?: unknown;
  transaction_amount?: unknown;
  currency_id?: unknown;
}

export type Decision =
  | { accion: "acreditar"; usuario: string; creditos: number; pagoId: string }
  | { accion: "ignorar"; motivo: string }
  | { accion: "alerta"; motivo: string };

/**
 * Qué hacer con un pago ya consultado a Mercado Pago (nunca con lo que dice la notificación).
 * «alerta» = algo no cuadra (monto, moneda, referencia): no se acredita y se deja en el log.
 */
export function decidirPago(pago: PagoMp, idNotificado: string): Decision {
  const pagoId = typeof pago.id === "number" || typeof pago.id === "string" ? String(pago.id) : "";
  if (pagoId !== idNotificado) return { accion: "alerta", motivo: "el pago consultado no es el notificado" };
  if (pago.status !== "approved") return { accion: "ignorar", motivo: `estado ${String(pago.status)}` };

  const ref = leerReferencia(pago.external_reference);
  if (!ref) return { accion: "alerta", motivo: "external_reference desconocida" };
  if (pago.currency_id !== "COP") return { accion: "alerta", motivo: `moneda ${String(pago.currency_id)}` };
  if (typeof pago.transaction_amount !== "number" || pago.transaction_amount < ref.paquete.precioCop) {
    return { accion: "alerta", motivo: `monto ${String(pago.transaction_amount)} menor que ${ref.paquete.precioCop}` };
  }
  return { accion: "acreditar", usuario: ref.usuario, creditos: ref.paquete.creditos, pagoId };
}
