import type { NextRequest } from "next/server";
import type { ConfigInicio } from "./tokenDebate.ts";

/**
 * Guardias de POST /api/debate/start: se ejecutan en orden DESPUÉS de validar
 * la configuración y ANTES de firmar el token. La primera que devuelva un
 * rechazo corta el inicio (nada se firma ni se cuenta después de ella).
 *
 * Aquí se enchufan las tareas siguientes, sin tocar la ruta:
 *  - cotejo-59jo58: Turnstile (verificar el desafío antes de emitir el token).
 *  - cotejo-xqsxp8: límite diario por IP (3 debates) y cupo global en Upstash.
 *  - cotejo-tkwelc: descontar créditos de pago al empezar.
 * Orden recomendado: Turnstile → límite por IP → cupo global → créditos (lo que
 * cuesta dinero o cupo, al final, para no gastarlo si una guardia anterior rechaza).
 * Los mensajes de error no deben repetir nada de lo que mandó el usuario.
 */
export interface ContextoInicio {
  request: NextRequest;
  config: ConfigInicio;
  /** Cuerpo ya parseado, por si una guardia necesita un campo propio (p. ej. el token de Turnstile). */
  cuerpo: Record<string, unknown>;
}

export interface RechazoGuardia {
  status: number;
  error: string;
}

export type GuardiaInicio = (ctx: ContextoInicio) => Promise<RechazoGuardia | null>;

export const GUARDIAS_INICIO: GuardiaInicio[] = [];

export async function pasarGuardias(
  ctx: ContextoInicio,
  guardias: readonly GuardiaInicio[] = GUARDIAS_INICIO
): Promise<RechazoGuardia | null> {
  for (const guardia of guardias) {
    const rechazo = await guardia(ctx);
    if (rechazo) return rechazo;
  }
  return null;
}
