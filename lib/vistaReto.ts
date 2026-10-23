import type { DebateMessage, DebateRole } from "../types/index.ts";
import { TOTAL_TURNS, TURN_PLAN } from "./debateEngine.ts";
import { nombreVisible, personalidadOClasica } from "./personalidades.ts";
import type { RetoPublico, VotosReto } from "./retos.ts";

// PÁGINA DEL RETO /r/<id> (v0.4.0, tarea cotejo-6tlml4): lo puro de la página, sin red ni React.
//
// Qué llega al navegador ANTES de votar (VistaReto): el tema, los 8 turnos y las personalidades.
// Ni la elección de quien retó ni el desenlace (frase 8, la escribe el personaje elegido y la
// delataría): esos dos solo salen en la respuesta de POST /api/retos/<id>/voto (ResultadoVotoReto).

/** Cookie httpOnly con el identificador opaco del navegador que vota (lib/retos.ts → nuevoIdVotante). */
export const COOKIE_VOTANTE = "diablongo_votante";
/** Un año: el mismo navegador no vuelve a votar el mismo reto. */
export const DURACION_COOKIE_VOTANTE_S = 60 * 60 * 24 * 365;

export const MENSAJE_RETO_NO_EXISTE = "Este reto no existe o el enlace está mal copiado.";
export const MENSAJE_VOTO_NO_DISPONIBLE = "No pudimos guardar tu voto ahora. Inténtalo de nuevo en un rato.";

/** Lo que recibe el componente cliente de la página del reto. */
export interface VistaReto {
  id: string;
  tema: string;
  /** Los 8 turnos en orden de TURN_PLAN (texto). */
  turnos: string[];
  personalidades: { pro: string; con: string };
}

/** Respuesta de POST /api/retos/<id>/voto cuando el voto entra (o ya estaba). */
export interface ResultadoVotoReto {
  /** false = este navegador ya había votado; `voto` es el de entonces. */
  registrado: boolean;
  voto: DebateRole;
  votos: VotosReto;
  /** A quién le hizo caso quien creó el reto. */
  eleccion: DebateRole;
  /** Lo que dijo el personaje elegido al final del debate original (puede faltar). */
  desenlace: string | null;
}

export function vistaReto(reto: RetoPublico): VistaReto {
  const turnos = reto.frases
    .filter((f) => f.indice < TOTAL_TURNS)
    .sort((a, b) => a.indice - b.indice)
    .map((f) => f.texto);
  return {
    id: reto.id,
    tema: reto.tema,
    turnos,
    personalidades: {
      pro: personalidadOClasica("pro", reto.personalidades.pro).id,
      con: personalidadOClasica("con", reto.personalidades.con).id,
    },
  };
}

export function desenlaceReto(reto: RetoPublico): string | null {
  const f = reto.frases.find((x) => x.indice === TOTAL_TURNS);
  return f && f.texto.trim() ? f.texto : null;
}

/** Los turnos ya dichos como mensajes de la arena (para saltar directo a la votación). */
export function mensajesDeTurnos(turnos: readonly string[]): DebateMessage[] {
  return TURN_PLAN.slice(0, turnos.length).map((t, i) => ({
    role: t.nextSpeaker,
    content: turnos[i],
    round: t.round,
    phase: t.phase,
  }));
}

/** Porcentaje de cada bando, entero y sumando 100 (0/0 si nadie votó). */
export function porcentajes(votos: VotosReto): VotosReto {
  const total = votos.pro + votos.con;
  if (total === 0) return { pro: 0, con: 0 };
  const pro = Math.round((votos.pro / total) * 100);
  return { pro, con: 100 - pro };
}

/** Nombre visible de cada personaje del reto («Ángel», «Abuela»…). */
export function nombresReto(personalidades: VistaReto["personalidades"]): Record<DebateRole, string> {
  return { pro: nombreVisible("pro", personalidades.pro), con: nombreVisible("con", personalidades.con) };
}

const MAX_TITULO = 70;

/** Tema recortado para el título de la pestaña y de la tarjeta de WhatsApp. */
export function temaParaTitulo(tema: string, max = MAX_TITULO): string {
  const limpio = tema.replace(/\s+/g, " ").trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`;
}

export const DESCRIPCION_RETO =
  "Un Ángel y un Diablo debatieron este dilema. ¿A quién le harías caso tú? Vota y descubre qué eligió quien te retó.";

/** Título y descripción del reto (pestaña, WhatsApp, Open Graph). La imagen la pone opengraph-image.tsx. */
export function textosMetadataReto(reto: Pick<RetoPublico, "tema">): { titulo: string; descripcion: string } {
  return { titulo: `«${temaParaTitulo(reto.tema)}» · Reto de Diablongo`, descripcion: DESCRIPCION_RETO };
}
