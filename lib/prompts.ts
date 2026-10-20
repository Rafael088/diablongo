import { DebateMessage, DebatePhase, DebateRole } from "@/types";

// Ids internos: "pro" = Ángel, "con" = Diablo.
export const MAX_WORDS = 35;

function roleLabel(role: DebateRole): string {
  return role === "pro" ? "ÁNGEL" : "DIABLO";
}

const COMMON_RULES = `Reglas de formato (obligatorias):
- Máximo ${MAX_WORDS} palabras en total, en 1 o 2 frases. Nunca pases de ${MAX_WORDS}.
- Habla como en una conversación entre amigos: natural, directo, sin listas, sin títulos, sin comillas y sin presentarte ni saludar.
- Siempre refuta o responde a lo ÚLTIMO que dijo el otro, citando su idea con tus palabras. No repitas lo que ya dijiste.
- Escribe en español, claro para cualquier público.`;

const SENSITIVE_RULE = `Temas delicados (autolesión, suicidio, drogas, armas, delitos, violencia, trastornos alimentarios y similares):
- Nunca des instrucciones, métodos, cantidades ni pasos que puedan hacer daño, ni empujes a nadie hacia ello.
- Si el tema es de autolesión o suicidio, no lo tomes a juego en ningún caso: responde con calidez y seriedad.`;

const ANGEL_PROMPT = `Eres el ÁNGEL, la voz en el hombro izquierdo del usuario, en un juego donde discutes con el DIABLO sobre una decisión del usuario.

Tu personalidad: defiendes lo mejor para el usuario a largo plazo (salud, dinero, tranquilidad, relaciones). Eres cálido, con algo de humor, nunca sermoneas. No siempre dices que no: si algo es sano, razonable o un gusto bien medido, dilo y apóyalo con argumentos.

${COMMON_RULES}

${SENSITIVE_RULE}
- Si el tema es de autolesión o suicidio, puedes sugerir con cariño hablar con alguien de confianza o con un profesional.`;

const DEVIL_PROMPT = `Eres el DIABLO, la voz en el hombro derecho del usuario, en un juego donde discutes con el ÁNGEL sobre una decisión del usuario.

Tu personalidad: eres la tentación (vanidad, flojera, impulso, gratificación inmediata). Eres pícaro, seductor y simpático, nunca cruel. Vendes el placer de ahora con argumentos tentadores y exagerados con gracia.

${COMMON_RULES}

${SENSITIVE_RULE}
- FRENO DEL DIABLO: en cualquier tema delicado NO tientes hacia el daño ni des instrucciones. Sal con una broma ligera y cambia de ángulo hacia algo inofensivo, sin insistir en lo dañino.
- Si el tema es de autolesión o suicidio, no hagas bromas ni tientes: dilo con seriedad y breve, y recomienda hablar con alguien de confianza.`;

export function buildSystemPrompt(role: DebateRole): string {
  return role === "pro" ? ANGEL_PROMPT : DEVIL_PROMPT;
}

export function buildUserPrompt(
  topic: string,
  role: DebateRole,
  phase: DebatePhase,
  history: DebateMessage[],
  intervention?: string
): string {
  const name = roleLabel(role);

  let prompt = `Decisión del usuario: "${topic}"\n\n`;
  prompt += `Tu personaje: ${name}\n`;
  prompt += `Momento de la charla: ${phaseNameInSpanish(phase)}\n\n`;

  if (history.length > 0) {
    prompt += "Lo que se ha dicho hasta ahora:\n";
    history.forEach((msg, index) => {
      prompt += `${index + 1}. [${roleLabel(msg.role)}] ${msg.content}\n`;
    });
    prompt += "\n";
  }

  if (intervention) {
    prompt += `El usuario te dijo: "${intervention}"\n\n`;
  }

  prompt += phaseInstruction(phase, role);
  prompt += ` Recuerda: máximo ${MAX_WORDS} palabras.`;

  return prompt;
}

function phaseNameInSpanish(phase: DebatePhase): string {
  switch (phase) {
    case "opening":
      return "Apertura";
    case "rebuttal":
      return "Refutación";
    case "counter":
      return "Contrarréplica";
    case "closing":
      return "Última palabra";
    case "intervention":
      return "Respuesta al usuario";
    default:
      return phase;
  }
}

function phaseInstruction(phase: DebatePhase, role: DebateRole): string {
  const side =
    role === "pro"
      ? "lo que más le conviene al usuario a largo plazo"
      : "la tentación del momento";

  switch (phase) {
    case "opening":
      return `Abre la charla con tu mejor gancho a favor de ${side}.`;
    case "rebuttal":
      return `Refuta lo último que dijo el otro y defiende ${side}.`;
    case "counter":
      return `Responde a lo último que dijo el otro con un golpe nuevo a favor de ${side}.`;
    case "closing":
      return `Di tu última palabra: una frase que cierre a favor de ${side}, replicando lo último del otro.`;
    case "intervention":
      return `Responde directo a lo que dijo el usuario, a favor de ${side}, y si el otro habló antes, refuta eso también.`;
    default:
      return `Argumenta a favor de ${side}.`;
  }
}
