import { DebatePhase, DebateRole } from "@/types";

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
