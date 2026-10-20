export type DebateRole = "pro" | "con";

export interface ProviderConfig {
  id: string;
  name: string;
  requiresApiKey: boolean;
  baseUrl?: string;
  models: string[];
}

export interface DebaterConfig {
  role: DebateRole;
  provider: string;
  model: string;
  apiKey: string;
  name: string;
}

/** Quien escribe un mensaje del historial: un personaje o el usuario. */
export type MessageRole = DebateRole | "user";

export interface DebateMessage {
  role: MessageRole;
  content: string;
  round: number;
  phase: DebatePhase;
}

/** Fases válidas de un turno. Única fuente: la usa también la validación del servidor. */
export const FASES = [
  "opening",
  "rebuttal",
  "counter",
  "closing",
  "intervention",
  /** Fase 9: el personaje elegido escribe el desenlace de la tarjeta final. */
  "desenlace",
] as const;

export type DebatePhase = (typeof FASES)[number];

export interface DebateConfig {
  topic: string;
  pro: DebaterConfig;
  con: DebaterConfig;
}

export interface DebateState {
  id: string;
  topic: string;
  totalTurns: number;
  currentRound: number;
  messages: DebateMessage[];
  status: "idle" | "running" | "paused" | "finished";
  winner?: "pro" | "con" | "tie";
}

export interface TurnRequest {
  topic: string;
  role: DebateRole;
  phase: DebatePhase;
  provider: string;
  model: string;
  apiKey: string;
  history: DebateMessage[];
  intervention?: string;
}

export interface TurnResponse {
  content: string;
  /** Aviso corto para la arena (p. ej. el servidor cambió de modelo gratis). */
  aviso?: string;
}
