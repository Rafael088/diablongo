import { DebateState } from "@/types";

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
  /** Modo de la pantalla de configuración (ausente en configs viejas). */
  modo?: string;
  proProvider: string;
  proModel: string;
  conProvider: string;
  conModel: string;
}

function localDelNavegador(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveConfig(config: SavedConfig, storage: Storage | null = localDelNavegador()): void {
  if (!storage) return;
  const { topic, modo, proProvider, proModel, conProvider, conModel } = config;
  try {
    storage.setItem(CONFIG_KEY, JSON.stringify({ topic, modo, proProvider, proModel, conProvider, conModel }));
  } catch {
    // storage lleno o bloqueado: la config simplemente no se recuerda
  }
}

// Las versiones viejas guardaban proApiKey/conApiKey en base64 dentro de la config.
// No se migran: estaban en un sitio que la persona no eligió. Se borran y el resto se conserva.
export function getConfig(storage: Storage | null = localDelNavegador()): SavedConfig | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    if ("proApiKey" in parsed || "conApiKey" in parsed) {
      delete parsed.proApiKey;
      delete parsed.conApiKey;
      try {
        storage.setItem(CONFIG_KEY, JSON.stringify(parsed));
      } catch {
        // si no se puede reescribir, al menos no se devuelven
      }
    }
    return parsed as unknown as SavedConfig;
  } catch {
    return null;
  }
}
