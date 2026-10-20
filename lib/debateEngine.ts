import type { DebatePhase, DebateRole } from "@/types";

/**
 * Motor de ping-pong del debate Ángel (pro) contra Diablo (con).
 *
 * Un debate son EXACTAMENTE 8 llamadas a modelos (TOTAL_TURNS):
 *
 *   #  quién    fase        qué hace
 *   1  Ángel    opening     apertura
 *   2  Diablo   opening     apertura
 *   3  Ángel    rebuttal    cruce 1: refuta lo último de Diablo
 *   4  Diablo   rebuttal    cruce 1: refuta lo último de Ángel
 *   5  Ángel    rebuttal    cruce 2
 *   6  Diablo   rebuttal    cruce 2
 *   7  Ángel    closing     cruce 3 = última palabra, replicando lo último del otro
 *   8  Diablo   closing     cruce 3 = última palabra (cierra el debate)
 *
 * Cómo cuadran 8: 2 aperturas + 3 cruces de refutación de 2 turnos (6 turnos).
 * El tercer cruce es la última palabra: se juega con la fase "closing", cuya
 * instrucción ya manda replicar lo último del otro. Así no existe la fase
 * "counter" (contrarréplica) en el flujo; sigue en el tipo y en prompts.ts solo
 * por compatibilidad.
 *
 * Intervención del usuario: NO es una llamada extra. El texto se guarda y el
 * siguiente turno del plan lo recibe en su prompt (campo `intervention`), así
 * el total sigue siendo 8. El punto definido es a mitad del debate, tras el
 * turno INTERVENTION_AFTER_TURN (4): ahí la arena se pausa para ofrecerla. El
 * usuario también puede intervenir en cualquier otro momento antes del final
 * (canIntervene); si intervienen varias veces antes del siguiente turno, los
 * textos se juntan (mergeIntervention).
 */
export const TOTAL_TURNS = 8;
export const INTERVENTION_AFTER_TURN = 4;

export interface Turn {
  /** posición en el plan, empezando en 0 */
  index: number;
  phase: DebatePhase;
  /** 0 = apertura; 1 y 2 = cruces de refutación; 3 = última palabra */
  round: number;
  nextSpeaker: DebateRole;
}

type PlanItem = Omit<Turn, "index">;

export const TURN_PLAN: readonly PlanItem[] = [
  { phase: "opening", round: 0, nextSpeaker: "pro" },
  { phase: "opening", round: 0, nextSpeaker: "con" },
  { phase: "rebuttal", round: 1, nextSpeaker: "pro" },
  { phase: "rebuttal", round: 1, nextSpeaker: "con" },
  { phase: "rebuttal", round: 2, nextSpeaker: "pro" },
  { phase: "rebuttal", round: 2, nextSpeaker: "con" },
  { phase: "closing", round: 3, nextSpeaker: "pro" },
  { phase: "closing", round: 3, nextSpeaker: "con" },
];

/** Turno número `index` (desde 0), o null si el debate ya terminó. */
export function getTurn(index: number): Turn | null {
  const item = TURN_PLAN[index];
  return item ? { index, ...item } : null;
}

export function getInitialTurn(): Turn {
  return getTurn(0) as Turn;
}

/** Turno que sigue después de haber jugado `turnsDone` turnos; null = fin. */
export function getNextTurn(turnsDone: number): Turn | null {
  return getTurn(turnsDone);
}

/** ¿Toca pausar para ofrecer la intervención del usuario? */
export function shouldPauseForIntervention(turnsDone: number): boolean {
  return turnsDone === INTERVENTION_AFTER_TURN;
}

/** El usuario puede intervenir mientras quede al menos un turno por jugar. */
export function canIntervene(turnsDone: number): boolean {
  return turnsDone < TOTAL_TURNS;
}

/** Junta intervenciones pendientes (la respuesta va en el siguiente turno). */
export function mergeIntervention(
  pending: string | undefined,
  text: string
): string {
  const clean = text.trim();
  return pending ? `${pending} ${clean}` : clean;
}
