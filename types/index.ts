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

export interface DebateMessage {
  role: DebateRole;
  content: string;
  round: number;
  phase: DebatePhase;
}

export type DebatePhase =
  | "opening"
  | "rebuttal"
  | "counter"
  | "closing"
  | "intervention";

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
}
