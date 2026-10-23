import { NextRequest, NextResponse, connection } from "next/server";
import { esObjeto } from "@/lib/validarTurno";
import { MAX_CUERPO_BYTES } from "@/lib/topes";
import {
  MENSAJE_RETO_DEVUELTO,
  MENSAJE_RETO_NO_DISPONIBLE,
  MENSAJE_RETO_SIN_COBRO,
  MENSAJE_RETO_SIN_SESION,
  MENSAJE_RETO_SIN_TERMINAR,
  crearReto,
  retosDeUsuario,
  validarEleccion,
} from "@/lib/retos";
import { contar } from "@/lib/metricas";
import { clienteServidor } from "@/lib/supabase/servidor";
import { clienteAdmin } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Lo único que acepta el cuerpo. Frases, tema o personalidades del navegador se rechazan con 400. */
const CAMPOS = new Set(["debate", "eleccion"]);

/**
 * POST /api/retos: guarda como reto un debate con créditos que terminó.
 * Cuerpo: { debate: "<id del debate, el `debate` que devuelve /api/debate/start>", eleccion: "pro" | "con" }.
 * Respuesta: 201 { id, creado: true, ruta: "/r/<id>" } la primera vez; 200 { id, creado: false, ruta }
 * si ese debate ya tenía reto (la elección no cambia). Tema, frases y personalidades los pone el
 * servidor con lo que él mismo guardó en cada turno (lib/retos.ts): nunca se toman del cuerpo.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const texto = await request.text();
    if (Buffer.byteLength(texto, "utf8") > MAX_CUERPO_BYTES) {
      return NextResponse.json({ error: "La petición es demasiado grande." }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(texto);
    } catch {
      return NextResponse.json({ error: "El cuerpo de la petición no es JSON." }, { status: 400 });
    }
    if (!esObjeto(body) || Object.keys(body).some((k) => !CAMPOS.has(k))) {
      return NextResponse.json({ error: "El cuerpo de la petición no es válido." }, { status: 400 });
    }
    if (typeof body.debate !== "string" || !UUID.test(body.debate)) {
      return NextResponse.json({ error: "Falta el debate." }, { status: 400 });
    }
    const eleccion = validarEleccion(body.eleccion);
    if (!eleccion.ok) return NextResponse.json({ error: eleccion.error }, { status: 400 });

    const sesion = await clienteServidor();
    const admin = clienteAdmin();
    if (!sesion || !admin) return NextResponse.json({ error: MENSAJE_RETO_NO_DISPONIBLE }, { status: 503 });
    const { data, error } = await sesion.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: MENSAJE_RETO_SIN_SESION }, { status: 401 });

    const r = await crearReto(admin, data.user.id, body.debate, eleccion.eleccion);
    if (!r.ok) {
      if (r.motivo === "sin_terminar") return NextResponse.json({ error: MENSAJE_RETO_SIN_TERMINAR }, { status: 409 });
      if (r.motivo === "devuelto") return NextResponse.json({ error: MENSAJE_RETO_DEVUELTO }, { status: 409 });
      // sin_cobro y ajeno dan el mismo 403: no se revela si el debate existe en otra cuenta.
      return NextResponse.json({ error: MENSAJE_RETO_SIN_COBRO }, { status: 403 });
    }
    if (r.creado) await contar("reto_creado");
    return NextResponse.json({ id: r.id, creado: r.creado, ruta: `/r/${r.id}` }, { status: r.creado ? 201 : 200 });
  } catch (error) {
    console.error("Retos error:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json({ error: MENSAJE_RETO_NO_DISPONIBLE }, { status: 503 });
  }
}

/** GET /api/retos: los retos de la persona con sesión, del más nuevo al más viejo, con sus votos. */
export async function GET(): Promise<NextResponse> {
  await connection();
  try {
    const sesion = await clienteServidor();
    const admin = clienteAdmin();
    if (!sesion || !admin) return NextResponse.json({ error: MENSAJE_RETO_NO_DISPONIBLE }, { status: 503 });
    const { data, error } = await sesion.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: MENSAJE_RETO_SIN_SESION }, { status: 401 });
    const retos = await retosDeUsuario(admin, data.user.id, 50);
    return NextResponse.json({ retos }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Retos lista error:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json({ error: MENSAJE_RETO_NO_DISPONIBLE }, { status: 503 });
  }
}
