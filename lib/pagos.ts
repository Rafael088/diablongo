// Lógica pura de pagos con Mercado Pago (Checkout Pro). Sin red ni estado: se prueba directo.
import type { Paquete } from "./paquetes.ts";

export const URL_PREFERENCIAS_MP = "https://api.mercadopago.com/checkout/preferences";

/** Origen público del sitio sin barra final: NEXT_PUBLIC_SITE_URL si existe, si no el de la petición. */
export function origenPublico(variable: string | undefined, origenPeticion: string): string {
  const v = variable?.trim();
  if (v) {
    try {
      return new URL(v).origin;
    } catch {
      // variable mal escrita: se ignora y se usa el origen de la petición
    }
  }
  return origenPeticion.replace(/\/+$/, "");
}

/** Identifica usuario, paquete y un uuid único del intento. El webhook la usa para saber qué acreditar. */
export function referenciaExterna(usuarioId: string, paqueteId: string, uuid: string): string {
  return `${usuarioId}:${paqueteId}:${uuid}`;
}

export function cuerpoPreferencia(opts: {
  paquete: Paquete;
  usuarioId: string;
  referencia: string;
  origen: string;
}) {
  const { paquete, usuarioId, referencia, origen } = opts;
  const vuelta = `${origen}/pagos/vuelta`;
  const https = origen.startsWith("https://");
  return {
    items: [
      {
        id: paquete.id,
        title: `Agent Debate: ${paquete.creditos} créditos (${paquete.nombre})`,
        quantity: 1,
        currency_id: "COP",
        unit_price: paquete.precioCop,
      },
    ],
    external_reference: referencia,
    metadata: { usuario_id: usuarioId, paquete: paquete.id, referencia },
    back_urls: { success: vuelta, failure: vuelta, pending: vuelta },
    // Mercado Pago rechaza auto_return si las back_urls no son https (p. ej. en localhost).
    ...(https ? { auto_return: "approved" } : {}),
    notification_url: `${origen}/api/pagos/webhook`,
  };
}

export type ResultadoVuelta = {
  estado: "aprobado" | "pendiente" | "rechazado" | "desconocido";
  titulo: string;
  detalle: string;
  pagoId: string | null;
};

const un = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Interpreta lo que Mercado Pago agrega a la URL de vuelta. Es solo informativo: NO acredita nada
 * (los créditos los suma únicamente el webhook, que verifica el pago con Mercado Pago).
 */
export function interpretarVuelta(query: Record<string, string | string[] | undefined>): ResultadoVuelta {
  const estado = (un(query.status) ?? un(query.collection_status) ?? "").toLowerCase();
  const id = un(query.payment_id) ?? un(query.collection_id);
  const pagoId = id && /^\d{1,20}$/.test(id) ? id : null;
  if (estado === "approved")
    return { estado: "aprobado", pagoId, titulo: "Pago aprobado", detalle: "Tus créditos aparecen en unos segundos." };
  if (estado === "pending" || estado === "in_process" || estado === "authorized")
    return {
      estado: "pendiente",
      pagoId,
      titulo: "Pago pendiente",
      detalle: "Estamos esperando la confirmación (PSE puede tardar un rato). Cuando se apruebe, tus créditos aparecerán solos.",
    };
  if (estado === "rejected" || estado === "cancelled" || estado === "failure")
    return { estado: "rechazado", pagoId, titulo: "Pago rechazado", detalle: "No se hizo ningún cobro. Puedes volver a intentarlo." };
  return {
    estado: "desconocido",
    pagoId,
    titulo: "No sabemos cómo terminó el pago",
    detalle: "Revisa tus créditos en el juego; si pagaste, aparecerán en unos minutos.",
  };
}
