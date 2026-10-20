import type { NextRequest } from "next/server";
import { consumirCupo, esModoGratis, ipDe } from "./limites.ts";
import { verificarTurnstile } from "./turnstile.ts";
import type { ConfigInicio } from "./tokenDebate.ts";
import { clienteServidor } from "./supabase/servidor.ts";
import { clienteAdmin } from "./supabase/admin.ts";
import { descontarDebate } from "./creditos.ts";
import {
  CREDITOS_POR_DEBATE,
  MENSAJE_CREDITOS_INSUFICIENTES,
  MENSAJE_CREDITOS_MEZCLA,
  MENSAJE_CREDITOS_NO_DISPONIBLE,
  MENSAJE_CREDITOS_SIN_SESION,
  PROVEEDOR_CREDITOS,
} from "./creditosDebate.ts";

/**
 * Guardias de POST /api/debate/start: se ejecutan en orden DESPUÉS de validar
 * la configuración y ANTES de firmar el token. La primera que devuelva un
 * rechazo corta el inicio (nada se firma ni se cuenta después de ella).
 *
 * Aquí se enchufan las tareas siguientes, sin tocar la ruta:
 *  - cotejo-xqsxp8: límite diario por IP (3 debates) y cupo global en Upstash.
 *  - cotejo-tkwelc: descontar créditos de pago al empezar (guardiaCreditos).
 * Orden recomendado: Turnstile → límite por IP → cupo global → créditos (lo que
 * cuesta dinero o cupo, al final, para no gastarlo si una guardia anterior rechaza).
 * Los mensajes de error no deben repetir nada de lo que mandó el usuario.
 */
export interface ContextoInicio {
  request: NextRequest;
  config: ConfigInicio;
  /** Cuerpo ya parseado, por si una guardia necesita un campo propio (p. ej. el token de Turnstile). */
  cuerpo: Record<string, unknown>;
  /** Campos que las guardias quieren añadir a la respuesta de /start cuando acepta (p. ej. `quedan`). */
  extra?: Record<string, unknown>;
  /** id del debate que va a firmarse: se elige antes de las guardias para poder cobrarlo. */
  debateId: string;
  /** Cuenta que pagó (la pone guardiaCreditos): va en el token para saber a quién devolver. */
  usuario?: string;
}

export interface RechazoGuardia {
  status: number;
  error: string;
  /** Campos extra de la respuesta de rechazo (p. ej. `quedan`, `reinicia` en el 429). */
  campos?: Record<string, unknown>;
}

export type GuardiaInicio = (ctx: ContextoInicio) => Promise<RechazoGuardia | null>;

/**
 * Turnstile (cotejo-59jo58): comprueba que quien empieza es una persona. Va PRIMERA y
 * se aplica a TODOS los modos (gratis y con key): /start es la puerta de entrada y el
 * registro de turnos y el servidor se gastan igual. Un bot rechazado aquí no consume cupo.
 * El token llega en el campo `turnstile` del cuerpo.
 */
export const guardiaTurnstile: GuardiaInicio = async (ctx) => {
  const r = await verificarTurnstile(ctx.cuerpo.turnstile, ipDe(ctx.request));
  return r.ok ? null : { status: r.status, error: r.error };
};

/**
 * Límite diario del modo gratis (cotejo-xqsxp8): por IP y cupo global, en Upstash.
 * Solo cuenta el modo gratis; los debates con key del usuario no gastan cupo.
 */
export const guardiaLimiteGratis: GuardiaInicio = async (ctx) => {
  if (!esModoGratis(ctx.config)) return null;
  const r = await consumirCupo(ctx.request);
  if (r.ok) {
    ctx.extra = { ...ctx.extra, quedan: r.quedan, reinicia: r.reinicia };
    return null;
  }
  if (r.status === 503) return { status: 503, error: r.error };
  return { status: 429, error: r.error, campos: { quedan: r.quedan, reinicia: r.reinicia } };
};

/**
 * Créditos (cotejo-tkwelc): un debate con créditos exige sesión y cobra CREDITOS_POR_DEBATE
 * con el id del debate como referencia (descontar_debate es atómica y nunca deja saldo
 * negativo). Va ÚLTIMA: es lo único que cuesta dinero. Si falla un turno, /api/debate devuelve.
 */
export const guardiaCreditos: GuardiaInicio = async (ctx) => {
  const roles = [ctx.config.pro.provider, ctx.config.con.provider];
  const conCreditos = roles.filter((p) => p === PROVEEDOR_CREDITOS).length;
  if (conCreditos === 0) return null;
  if (conCreditos !== roles.length) return { status: 400, error: MENSAJE_CREDITOS_MEZCLA };

  const sesion = await clienteServidor();
  const admin = clienteAdmin();
  if (!sesion || !admin || !process.env.OPENROUTER_API_KEY) {
    return { status: 503, error: MENSAJE_CREDITOS_NO_DISPONIBLE };
  }
  const { data, error } = await sesion.auth.getUser();
  if (error || !data.user) return { status: 401, error: MENSAJE_CREDITOS_SIN_SESION };

  try {
    const cobro = await descontarDebate(admin, data.user.id, CREDITOS_POR_DEBATE, ctx.debateId);
    if (!cobro.ok) return { status: 402, error: MENSAJE_CREDITOS_INSUFICIENTES };
    ctx.usuario = data.user.id;
    ctx.extra = { ...ctx.extra, creditos: cobro.saldo };
    return null;
  } catch (e) {
    console.error("No se pudo cobrar el debate:", e instanceof Error ? e.message : "desconocido");
    return { status: 503, error: MENSAJE_CREDITOS_NO_DISPONIBLE };
  }
};

export const GUARDIAS_INICIO: GuardiaInicio[] = [guardiaTurnstile, guardiaLimiteGratis, guardiaCreditos];

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
