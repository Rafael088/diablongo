/** Reglas puras del ritmo de lectura: cuándo avanza el diálogo y con qué teclas. */

import { getTurn, shouldPauseForIntervention } from "./debateEngine.ts";

/** Qué hace el juego cuando la frase actual ya se terminó de escribir. */
export type AccionTrasLeer = "terminar" | "pausar" | "esperar-siguiente";

/**
 * `turnosJugados` cuenta los turnos de personajes ya dichos. Terminar y pausar
 * para intervenir no esperan clic; el resto espera a que la persona pulse «Siguiente».
 */
export function accionTrasLeer(turnosJugados: number): AccionTrasLeer {
  if (!getTurn(turnosJugados)) return "terminar";
  if (shouldPauseForIntervention(turnosJugados)) return "pausar";
  return "esperar-siguiente";
}

/** Lo mínimo que se mira del elemento que recibe la tecla. */
export interface ObjetivoTecla {
  tagName?: string;
  isContentEditable?: boolean;
}

const ETIQUETAS_PROPIAS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"]);

/**
 * Enter o espacio avanzan el diálogo, salvo si el foco está en un campo de
 * texto, un botón o un enlace (esos ya tienen su propia acción con esas teclas).
 */
export function teclaAvanza(key: string, objetivo?: ObjetivoTecla | null): boolean {
  if (key !== "Enter" && key !== " ") return false;
  if (!objetivo) return true;
  if (objetivo.isContentEditable) return false;
  const etiqueta = objetivo.tagName?.toUpperCase();
  return !(etiqueta && ETIQUETAS_PROPIAS.has(etiqueta));
}
