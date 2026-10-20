import { DebateMessage, DebatePhase, DebateRole } from "@/types";

export function buildSystemPrompt(role: DebateRole): string {
  const roleName = role === "pro" ? "DEFENSOR (PRO)" : "OPOSITOR (CON)";
  return `Eres un ${roleName} en un debate formal.

Reglas:
- Defiende tu postura con argumentos claros, concisos y bien estructurados.
- Responde en 1-3 párrafos cortos.
- No te presentes ni saludes. Ve directo al argumento.
- No repitas tu posición inicial en cada turno; avanza el debate.
- Cuando sea tu turno, responde al argumento más reciente del oponente si existe.
- Usa español, salvo que el tema requiera términos técnicos en inglés.`;
}

export function buildUserPrompt(
  topic: string,
  role: DebateRole,
  phase: DebatePhase,
  history: DebateMessage[],
  intervention?: string
): string {
  const roleName = role === "pro" ? "DEFENSOR (PRO)" : "OPOSITOR (CON)";
  const phaseName = phaseNameInSpanish(phase);

  let prompt = `Tema del debate: "${topic}"\n\n`;
  prompt += `Tu rol: ${roleName}\n`;
  prompt += `Fase actual: ${phaseName}\n\n`;

  if (history.length > 0) {
    prompt += "Historial del debate:\n";
    history.forEach((msg, index) => {
      const speaker = msg.role === "pro" ? "PRO" : "CON";
      prompt += `${index + 1}. [${speaker}] ${msg.content}\n`;
    });
    prompt += "\n";
  }

  if (intervention) {
    prompt += `Intervención del usuario dirigida a ${roleName}: "${intervention}"\n\n`;
  }

  prompt += phaseInstruction(phase, role);

  return prompt;
}

function phaseNameInSpanish(phase: DebatePhase): string {
  switch (phase) {
    case "opening":
      return "Apertura";
    case "rebuttal":
      return "Refutación";
    case "counter":
      return "Contraargumento";
    case "closing":
      return "Cierre";
    case "intervention":
      return "Respuesta a intervención";
    default:
      return phase;
  }
}

function phaseInstruction(phase: DebatePhase, role: DebateRole): string {
  const position = role === "pro" ? "a favor" : "en contra";

  switch (phase) {
    case "opening":
      return `Expón tu posición ${position} del tema. Presenta tus 2 mejores argumentos iniciales.`;
    case "rebuttal":
      return `Refuta el argumento más reciente de tu oponente y defiende tu postura ${position}.`;
    case "counter":
      return `Responde a la refutación del oponente, refuerza tu postura ${position} y, si es posible, introduce un nuevo argumento.`;
    case "closing":
      return `Resume tu postura ${position} y por qué crees que tu posición es la más sólida. Máximo 2 párrafos.`;
    case "intervention":
      return `Responde directamente a la intervención del usuario desde tu postura ${position}.`;
    default:
      return `Argumenta ${position} del tema.`;
  }
}

export function getNextPhase(
  currentPhase: DebatePhase,
  currentRound: number,
  totalRounds: number,
  lastSpeaker: DebateRole
): { phase: DebatePhase; round: number; nextSpeaker: DebateRole } {
  // Opening phase: PRO then CON
  if (currentPhase === "opening" && lastSpeaker === "pro") {
    return { phase: "opening", round: 0, nextSpeaker: "con" };
  }

  // After CON opening, start round 1 rebuttals with PRO
  if (currentPhase === "opening" && lastSpeaker === "con") {
    return { phase: "rebuttal", round: 1, nextSpeaker: "pro" };
  }

  // Rebuttal phase: PRO then CON
  if (currentPhase === "rebuttal" && lastSpeaker === "pro") {
    return { phase: "rebuttal", round: currentRound, nextSpeaker: "con" };
  }

  // After CON rebuttal, move to counter phase with PRO
  if (currentPhase === "rebuttal" && lastSpeaker === "con") {
    return { phase: "counter", round: currentRound, nextSpeaker: "pro" };
  }

  // Counter phase: PRO then CON
  if (currentPhase === "counter" && lastSpeaker === "pro") {
    return { phase: "counter", round: currentRound, nextSpeaker: "con" };
  }

  // After CON counter, advance round
  if (currentPhase === "counter" && lastSpeaker === "con") {
    if (currentRound >= totalRounds) {
      return { phase: "closing", round: currentRound, nextSpeaker: "pro" };
    }
    return { phase: "rebuttal", round: currentRound + 1, nextSpeaker: "pro" };
  }

  // Closing phase: PRO then CON
  if (currentPhase === "closing" && lastSpeaker === "pro") {
    return { phase: "closing", round: currentRound, nextSpeaker: "con" };
  }

  // After CON closing, debate ends
  return { phase: "closing", round: currentRound, nextSpeaker: "pro" };
}

export function getInitialTurn(): {
  phase: DebatePhase;
  round: number;
  nextSpeaker: DebateRole;
} {
  return { phase: "opening", round: 0, nextSpeaker: "pro" };
}
