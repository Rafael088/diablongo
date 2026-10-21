import { NextRequest, NextResponse, connection } from "next/server";
import { consultarCupo } from "@/lib/limites";

const SIN_CACHE = { "Cache-Control": "no-store" };

/** GET /api/debate/cupo: debates gratis que le quedan hoy a esta IP y cuándo se reinicia. No consume. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Solo en cada visita: sin esto el build intenta prerenderizarla y llega a tocar Upstash.
  await connection();
  try {
    const r = await consultarCupo(request);
    if (!r.ok && r.motivo === "sin-almacen") {
      return NextResponse.json({ error: r.error }, { status: 503, headers: SIN_CACHE });
    }
    return NextResponse.json({ quedan: r.ok ? r.quedan : 0, reinicia: r.reinicia }, { headers: SIN_CACHE });
  } catch (error) {
    console.error("Cupo error:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json({ error: "No se pudo consultar el cupo." }, { status: 500 });
  }
}
