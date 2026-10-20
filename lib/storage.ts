import { DebateState, DebaterConfig } from "@/types";

const DEBATES_KEY = "agent-debate-history";
const CONFIG_KEY = "agent-debate-config";

export function saveDebate(debate: DebateState): void {
  if (typeof window === "undefined") return;
  const debates = getDebates();
  const existingIndex = debates.findIndex((d) => d.id === debate.id);

  if (existingIndex >= 0) {
    debates[existingIndex] = debate;
  } else {
    debates.unshift(debate);
  }

  localStorage.setItem(DEBATES_KEY, JSON.stringify(debates.slice(0, 50)));
}

export function getDebates(): DebateState[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(DEBATES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DebateState[];
  } catch {
    return [];
  }
}

export function deleteDebate(id: string): void {
  if (typeof window === "undefined") return;
  const debates = getDebates().filter((d) => d.id !== id);
  localStorage.setItem(DEBATES_KEY, JSON.stringify(debates));
}

export interface SavedConfig {
  topic: string;
  rounds: number;
  proProvider: string;
  proModel: string;
  conProvider: string;
  conModel: string;
  // Keys are obfuscated, not encrypted
  proApiKey?: string;
  conApiKey?: string;
}

function obfuscate(text: string): string {
  return typeof window === "undefined"
    ? text
    : btoa(text);
}

function deobfuscate(text: string): string {
  return typeof window === "undefined"
    ? text
    : atob(text);
}

export function saveConfig(config: SavedConfig): void {
  if (typeof window === "undefined") return;
  const storable: SavedConfig = {
    ...config,
    proApiKey: config.proApiKey ? obfuscate(config.proApiKey) : undefined,
    conApiKey: config.conApiKey ? obfuscate(config.conApiKey) : undefined,
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(storable));
}

export function getConfig(): SavedConfig | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedConfig;
    return {
      ...parsed,
      proApiKey: parsed.proApiKey ? deobfuscate(parsed.proApiKey) : undefined,
      conApiKey: parsed.conApiKey ? deobfuscate(parsed.conApiKey) : undefined,
    };
  } catch {
    return null;
  }
}
