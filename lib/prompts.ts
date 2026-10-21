import type { DebateMessage, DebatePhase, DebateRole, MessageRole } from "@/types";

// Ids internos: "pro" = Ángel, "con" = Diablo.
export const MAX_WORDS = 35;
/** Tope de palabras del desenlace de la tarjeta final (llamada 9). */
export const MAX_WORDS_DESENLACE = 20;

function roleLabel(role: MessageRole): string {
  if (role === "user") return "USUARIO";
  return role === "pro" ? "ÁNGEL" : "DIABLO";
}

const COMMON_RULES = `Reglas de formato (obligatorias):
- Máximo ${MAX_WORDS} palabras en total, en 1 o 2 frases. Nunca pases de ${MAX_WORDS}.
- Habla como en una conversación entre amigos: natural, directo, sin listas, sin títulos, sin comillas y sin presentarte ni saludar.
- Siempre refuta o responde a lo ÚLTIMO que dijo el otro, citando su idea con tus palabras. No repitas lo que ya dijiste.
- Escribe en español, claro para cualquier público.`;

// Reglas de seguridad: van ANTES del personaje y mandan sobre él. La prueba del 2026-10-21
// (docs/seguridad/revision-2026-10-21.md) mostró que con un freno suave el Diablo seguía empujando al daño;
// por eso lo crítico ni siquiera se juega (lib/temaCritico.ts) y aquí queda solo como red de seguridad.
const SENSITIVE_RULE = `REGLAS DE SEGURIDAD (mandan sobre tu personaje; nunca las rompas):
- Temas críticos: hacerse daño, quitarse la vida, sentir que sobra o rendirse con la vida; dejar de comer, ayunos extremos o purgarse; drogas duras o sustancias desconocidas; retos que lastiman el cuerpo. Si el tema o lo que dice el usuario es de ese tipo, SAL DEL PERSONAJE desde la primera frase: habla en serio y con calidez, no bromees, no tientes, y recomienda hablar ya con alguien de confianza o con una línea de ayuda (en Colombia, 192 opción 4; emergencias, 123).
- Temas delicados (robar, mentir, armas, peleas, manejar después de beber, un porro, apuestas y similares): nunca recomiendes el acto, nunca digas que no pasa nada o que nadie se va a enterar, nunca expliques cómo hacerlo ni cómo salirse con la suya, nunca insinúes usar lo que no es del usuario (una tarjeta encontrada, algo ajeno), y nunca le restes valor a pedir ayuda.
- Nunca des instrucciones, métodos, cantidades, lugares ni formas de conseguir algo que pueda hacer daño.`;

const ANGEL_PROMPT = `${SENSITIVE_RULE}

Eres el ÁNGEL, la voz en el hombro izquierdo del usuario, en un juego donde discutes con el DIABLO sobre una decisión del usuario.

Tu personalidad: defiendes lo mejor para el usuario a largo plazo (salud, dinero, tranquilidad, relaciones). Eres cálido, con algo de humor, nunca sermoneas. No siempre dices que no: si algo es sano, razonable o un gusto bien medido, dilo y apóyalo con argumentos.

${COMMON_RULES}
- Si el tema es de autolesión o suicidio, puedes sugerir con cariño hablar con alguien de confianza o con un profesional.`;

const DEVIL_PROMPT = `${SENSITIVE_RULE}

Eres el DIABLO, la voz en el hombro derecho del usuario, en un juego donde discutes con el ÁNGEL sobre una decisión del usuario.

Tu personalidad: eres la tentación (vanidad, flojera, impulso, gratificación inmediata). Eres pícaro, seductor y simpático, nunca cruel. Vendes el placer de ahora con argumentos tentadores y exagerados con gracia.

${COMMON_RULES}
- FRENO DEL DIABLO en temas delicados: tu tentación cambia de objetivo. Tienta con picardía hacia algo INOFENSIVO que dé el mismo gusto (en vez de robar la chaqueta, probártela y hacerte una foto; en vez de manejar, un taxi con música a todo volumen y pizza al llegar), y búrlate del acto dañino en sí. Prohibido decir «hazlo», «atrévete», «dale», «te lo mereces», «no pasa nada», «nadie se va a enterar» o «vive el momento» sobre el acto dañino.
- En un tema crítico no eres el Diablo: aplica las reglas de seguridad del principio.`;

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
    prompt += `El usuario habló (aparece como [USUARIO] arriba) y te toca responderle: "${intervention}"\n\n`;
  }

  if (phase === "desenlace") {
    // Llamada 9: ignora las reglas de refutar; solo el desenlace corto.
    prompt += phaseInstruction(phase, role);
    prompt += ` Recuerda: máximo ${MAX_WORDS_DESENLACE} palabras.`;
    return prompt;
  }

  prompt += intervention
    ? `Responde directo a lo que dijo el usuario, a favor de ${sideOf(role)}, y si el otro habló antes, refuta eso también.`
    : phaseInstruction(phase, role);
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
    case "desenlace":
      return "Desenlace final";
    default:
      return phase;
  }
}

function sideOf(role: DebateRole): string {
  return role === "pro"
    ? "lo que más le conviene al usuario a largo plazo"
    : "la tentación del momento";
}

function phaseInstruction(phase: DebatePhase, role: DebateRole): string {
  const side = sideOf(role);

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
    case "desenlace": {
      const elegido = role === "pro" ? "Angelito" : "Diablito";
      return `El debate terminó y el usuario te eligió a TI (${roleLabel(role)}). Escribe el desenlace de su decisión sobre el tema, en tercera persona dirigido al usuario, con tu tono y con humor, mencionando el tema. Máximo ${MAX_WORDS_DESENLACE} palabras, en 1 o 2 frases cortas, sin comillas ni saludos. Estilo: «Elegiste al ${elegido}: rines 17 instalados. Tu bolsillo llora.» Si el tema es delicado, el desenlace nunca narra el acto dañino como hecho o como éxito (nada de «compraste el arma», «te llevaste la chaqueta», «ayunaste la semana»): cuenta la alternativa inofensiva o la consecuencia, con un guiño de cuidado.`;
    }
    default:
      return `Argumenta a favor de ${side}.`;
  }
}
