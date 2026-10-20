import { NextResponse, type NextRequest } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";
import { acreditarCompra, ErrorCreditos } from "@/lib/creditos";
import { decidirPago, firmaValida, type PagoMp } from "@/lib/webhookMp";

// Webhook de Mercado Pago: lo único que suma créditos. Mercado Pago avisa con
// POST /api/pagos/webhook?data.id=<pago>&type=payment y reintenta (cada 15 min) mientras no reciba 2xx.
//
// 1. La firma x-signature tiene que ser nuestra (si no, 401).
// 2. El pago se consulta a Mercado Pago: nunca se cree lo que trae la notificación.
// 3. Solo un pago aprobado, en COP, con monto suficiente y referencia nuestra acredita.
// 4. acreditar_compra usa el id del pago como referencia única: un aviso repetido no suma dos veces.
//
// Códigos: 2xx = listo (o nada que hacer); 5xx = falla nuestra o de Mercado Pago, que reintente.

const URL_PAGOS_MP = "https://api.mercadopago.com/v1/payments/";

const listo = (cuerpo: Record<string, unknown>) => NextResponse.json(cuerpo, { status: 200 });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams;
  let cuerpo: { type?: unknown } | null = null;
  try {
    cuerpo = await request.json();
  } catch {
    // Sin cuerpo JSON: basta con la query.
  }

  const tipo = query.get("type") ?? cuerpo?.type;
  const dataId = query.get("data.id");
  // Otros avisos (merchant_order, IPN viejo con ?topic=…): no mueven créditos.
  if (tipo !== "payment" || !dataId) return listo({ ignorado: "no es un aviso de pago" });

  const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  const admin = clienteAdmin();
  if (!secreto || !token || !admin) {
    console.error("Webhook de Mercado Pago sin configurar (secreto, token o Supabase)");
    return NextResponse.json({ error: "Pagos sin configurar" }, { status: 503 });
  }

  const firmada = firmaValida({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    secreto,
  });
  if (!firmada) {
    console.warn("Webhook de Mercado Pago con firma inválida");
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  if (!/^\d{1,20}$/.test(dataId)) return listo({ ignorado: "id de pago con formato raro" });

  let pago: PagoMp;
  try {
    const r = await fetch(URL_PAGOS_MP + dataId, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    // Las notificaciones de prueba del panel traen un id que no existe: nada que acreditar.
    if (r.status === 404) return listo({ ignorado: "pago inexistente" });
    if (!r.ok) {
      console.error("Mercado Pago no devolvió el pago:", r.status);
      return NextResponse.json({ error: "No se pudo consultar el pago" }, { status: 502 });
    }
    pago = (await r.json()) as PagoMp;
  } catch {
    console.error("No se pudo contactar a Mercado Pago");
    return NextResponse.json({ error: "No se pudo consultar el pago" }, { status: 502 });
  }

  const decision = decidirPago(pago, dataId);
  if (decision.accion === "ignorar") return listo({ ignorado: decision.motivo });
  if (decision.accion === "alerta") {
    // Reintentar no lo arregla: se responde 200 y queda en el log para revisarlo a mano.
    console.error(`Pago ${dataId} no acreditado: ${decision.motivo}`);
    return listo({ ignorado: "revisar a mano" });
  }

  try {
    const r = await acreditarCompra(admin, decision.usuario, decision.creditos, decision.pagoId);
    return listo({ acreditado: r.acreditado });
  } catch (error) {
    // La cuenta ya no existe (se borró después de pagar): reintentar no lo arregla.
    if (error instanceof ErrorCreditos && error.codigo === "23503") {
      console.error(`Pago ${dataId} de una cuenta que ya no existe: revisar a mano`);
      return listo({ ignorado: "revisar a mano" });
    }
    console.error(`No se pudo acreditar el pago ${dataId}:`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No se pudo acreditar" }, { status: 500 });
  }
}
