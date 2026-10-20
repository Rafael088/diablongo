import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paquetePorId } from "@/lib/paquetes";
import { URL_PREFERENCIAS_MP, cuerpoPreferencia, origenPublico, referenciaExterna } from "@/lib/pagos";

// Crea la preferencia de Checkout Pro de un paquete y devuelve la URL de pago. El precio sale de
// lib/paquetes.ts, jamás del cliente. Los créditos los suma el webhook (otra tarea), no esta ruta.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await clienteServidor();
  if (!supabase) return NextResponse.json({ error: "Las cuentas no están configuradas." }, { status: 503 });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ error: "Entra a tu cuenta para comprar créditos." }, { status: 401 });

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  const paquete = paquetePorId((cuerpo as { paquete?: unknown } | null)?.paquete);
  if (!paquete) return NextResponse.json({ error: "Ese paquete no existe." }, { status: 400 });

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "Los pagos todavía no están configurados." }, { status: 503 });

  const origen = origenPublico(process.env.NEXT_PUBLIC_SITE_URL, request.nextUrl.origin);
  const referencia = referenciaExterna(data.user.id, paquete.id, crypto.randomUUID());
  const fallo = NextResponse.json({ error: "No pudimos iniciar el pago. Vuelve a intentarlo." }, { status: 502 });

  try {
    const r = await fetch(URL_PREFERENCIAS_MP, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(cuerpoPreferencia({ paquete, usuarioId: data.user.id, referencia, origen })),
    });
    if (!r.ok) {
      console.error("Mercado Pago rechazó la preferencia:", r.status);
      return fallo;
    }
    const pref = (await r.json()) as { init_point?: unknown };
    if (typeof pref.init_point !== "string") {
      console.error("Mercado Pago respondió sin init_point");
      return fallo;
    }
    return NextResponse.json({ url: pref.init_point }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("No se pudo contactar a Mercado Pago");
    return fallo;
  }
}
