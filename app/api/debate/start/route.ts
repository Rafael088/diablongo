import { NextRequest, NextResponse } from "next/server";
import { TOTAL_LLAMADAS } from "@/lib/debateEngine";
import { pasarGuardias, type ContextoInicio } from "@/lib/guardiasInicio";
import { MENSAJE_SIN_SECRETO, emitirToken, obtenerSecreto, validarInicio } from "@/lib/tokenDebate";
import { esObjeto } from "@/lib/validarTurno";
import { MAX_CUERPO_BYTES } from "@/lib/topes";

/**
 * POST /api/debate/start: empieza un debate. Valida la configuración (sin claves),
 * pasa las guardias (lib/guardiasInicio.ts) y emite el token firmado que cada
 * turno de /api/debate tiene que presentar. Ver lib/tokenDebate.ts.
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
    };
    const rechazo = await pasarGuardias(ctx);
    if (rechazo) {
      return NextResponse.json({ error: rechazo.error, ...rechazo.campos }, { status: rechazo.status });
    }

    const { token, payload } = emitirToken(validacion.config, secreto);
    return NextResponse.json({ token, llamadas: TOTAL_LLAMADAS, expira: payload.exp, ...ctx.extra });
  } catch (error) {
    console.error("Debate start error:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json({ error: "No se pudo empezar el debate." }, { status: 500 });
  }
}
