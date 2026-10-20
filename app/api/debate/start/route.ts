import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { TOTAL_LLAMADAS } from "@/lib/debateEngine";
import { pasarGuardias, type ContextoInicio } from "@/lib/guardiasInicio";
import { MENSAJE_SIN_SECRETO, emitirToken, obtenerSecreto, validarInicio } from "@/lib/tokenDebate";
import { esObjeto } from "@/lib/validarTurno";
import { MAX_CUERPO_BYTES } from "@/lib/topes";
import { devolverDebate } from "@/lib/creditos";
import { clienteAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/debate/start: empieza un debate. Valida la configuración (sin claves),
 * pasa las guardias (lib/guardiasInicio.ts) y emite el token firmado que cada
 * turno de /api/debate tiene que presentar. Ver lib/tokenDebate.ts.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let cobrado: { usuario: string; debateId: string } | null = null;
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

    const validacion = validarInicio(body);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const secreto = obtenerSecreto();
    if (!secreto) {
      return NextResponse.json({ error: MENSAJE_SIN_SECRETO }, { status: 503 });
    }

    const ctx: ContextoInicio = {
      request,
      config: validacion.config,
      cuerpo: esObjeto(body) ? body : {},
      debateId: randomUUID(),
    };
    const rechazo = await pasarGuardias(ctx);
    if (rechazo) {
      return NextResponse.json({ error: rechazo.error, ...rechazo.campos }, { status: rechazo.status });
    }
    if (ctx.usuario) cobrado = { usuario: ctx.usuario, debateId: ctx.debateId };

    const { token, payload } = emitirToken(validacion.config, secreto, Date.now(), {
      id: ctx.debateId,
      usuario: ctx.usuario,
    });
    return NextResponse.json({ token, llamadas: TOTAL_LLAMADAS, expira: payload.exp, ...ctx.extra });
  } catch (error) {
    console.error("Debate start error:", error instanceof Error ? error.message : "desconocido");
    // Se cobró pero no se llegó a dar el token: el crédito se devuelve.
    const admin = cobrado && clienteAdmin();
    if (cobrado && admin) await devolverDebate(admin, cobrado.usuario, cobrado.debateId).catch(() => {});
    return NextResponse.json({ error: "No se pudo empezar el debate." }, { status: 500 });
  }
}
