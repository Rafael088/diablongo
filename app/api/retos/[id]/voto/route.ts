import { NextRequest, NextResponse } from "next/server";
import { esObjeto } from "@/lib/validarTurno";
import { MAX_CUERPO_BYTES } from "@/lib/topes";
import { ipDe } from "@/lib/limites";
import { ACCION_TURNSTILE_VOTO, verificarTurnstile } from "@/lib/turnstile";
import { esIdReto, esVotante, leerReto, nuevoIdVotante, registrarVoto, validarEleccion } from "@/lib/retos";
import { clienteAdmin } from "@/lib/supabase/admin";
import {
  COOKIE_VOTANTE,
  DURACION_COOKIE_VOTANTE_S,
  MENSAJE_RETO_NO_EXISTE,
  MENSAJE_VOTO_NO_DISPONIBLE,
  desenlaceReto,
  type ResultadoVotoReto,
} from "@/lib/vistaReto";
import { contarEventoReto } from "@/lib/eventosReto";

const CAMPOS = new Set(["voto", "turnstile"]);
const SIN_CACHE = { "Cache-Control": "no-store" };

const json = (cuerpo: unknown, status = 200) => NextResponse.json(cuerpo, { status, headers: SIN_CACHE });

/**
 * POST /api/retos/<id>/voto: quien abrió el reto vota a quién le haría caso.
 * Cuerpo: { voto: "pro" | "con", turnstile: "<token del widget, acción votar-reto>" }.
 * Un voto por navegador: la cookie httpOnly COOKIE_VOTANTE lo identifica (se crea aquí si falta).
 * Respuesta 200: ResultadoVotoReto (votos de la gente, qué eligió quien retó y su desenlace). Si ese
 * navegador ya había votado, registrado = false y `voto` es el de entonces (no cambia).
 * 400 cuerpo inválido · 403/503 Turnstile · 404 reto inexistente · 503 base no disponible.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/retos/[id]/voto">): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!esIdReto(id)) return json({ error: MENSAJE_RETO_NO_EXISTE }, 404);

    const texto = await request.text();
    if (Buffer.byteLength(texto, "utf8") > MAX_CUERPO_BYTES) {
      return json({ error: "La petición es demasiado grande." }, 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(texto);
    } catch {
      return json({ error: "El cuerpo de la petición no es JSON." }, 400);
    }
    if (!esObjeto(body) || Object.keys(body).some((k) => !CAMPOS.has(k))) {
      return json({ error: "El cuerpo de la petición no es válido." }, 400);
    }
    const voto = validarEleccion(body.voto);
    if (!voto.ok) return json({ error: voto.error }, 400);

    // Primero Turnstile: un bot no llega a la base.
    const humano = await verificarTurnstile(body.turnstile, ipDe(request), process.env, ACCION_TURNSTILE_VOTO);
    if (!humano.ok) return json({ error: humano.error }, humano.status);

    const admin = clienteAdmin();
    if (!admin) return json({ error: MENSAJE_VOTO_NO_DISPONIBLE }, 503);

    const reto = await leerReto(admin, id);
    if (!reto) return json({ error: MENSAJE_RETO_NO_EXISTE }, 404);

    const previa = request.cookies.get(COOKIE_VOTANTE)?.value;
    const votante = esVotante(previa) ? previa : nuevoIdVotante();

    const r = await registrarVoto(admin, id, votante, voto.eleccion);
    if (!r.ok) return json({ error: MENSAJE_RETO_NO_EXISTE }, 404);
    if (r.registrado) await contarEventoReto("reto_votado", { retoId: id, voto: r.voto }).catch(() => {});

    const resultado: ResultadoVotoReto = {
      registrado: r.registrado,
      voto: r.voto,
      votos: r.votos,
      eleccion: reto.eleccion,
      desenlace: desenlaceReto(reto),
    };
    const res = json(resultado);
    if (votante !== previa) {
      res.cookies.set(COOKIE_VOTANTE, votante, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: DURACION_COOKIE_VOTANTE_S,
      });
    }
    return res;
  } catch (error) {
    console.error("Voto de reto:", error instanceof Error ? error.message : "desconocido");
    return json({ error: MENSAJE_VOTO_NO_DISPONIBLE }, 503);
  }
}
