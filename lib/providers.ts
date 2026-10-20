import type { ProviderConfig } from "@/types";

// LISTA BLANCA del servidor: lib/validarTurno.ts rechaza cualquier modelo que no esté aquí.
// Verificada el 2026-10-19. Fuentes:
//  - openrouter: https://openrouter.ai/api/v1/models (API pública, sin key; todos los IDs existen).
//  - gemini: https://ai.google.dev/gemini-api/docs/models (la 2.5 caduca el 20-oct-2026; 2.0 y 1.5 retiradas).
//  - groq: https://console.groq.com/docs/models (producción y vista previa).
//  - ollama: modelos locales que instala el usuario (no hay catálogo público que verificar).
// Retirados y fuera: claude-3.7-sonnet, gemini-1.5-*, gemini-2.0-*, gemini-2.5-*, qwen-2.5-32b, deepseek-r1-distill-*.
// NO poner modelos de razonamiento (r1, o1/o3/o4, qwq, «thinking», reasoner, gpt-oss, muse-spark...):
// MAX_TOKENS_RESPUESTA = 120 (lib/topes.ts) y gastan los tokens pensando, así que pueden devolver vacío.
// Los modelos de abajo no razonan por defecto y la ruta no envía parámetros de razonamiento.
// ConfigPanel usa openrouter.models[0] (Ángel) y [1] (Diablo): mantenerlos rápidos, baratos y buenos en español.
// scripts/comprobar-catalogo.ts vigila todo esto.

export const providers: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    requiresApiKey: true,
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "anthropic/claude-haiku-5.5",
      "google/gemini-3.1-flash-lite",
      "openai/gpt-6-luna",
      "meta-llama/llama-3.3-70b-instruct",
      "mistralai/mistral-large-2512",
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    requiresApiKey: true,
    models: [
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.8-flash",
    ],
  },
  {
    id: "groq",
    name: "Groq",
    requiresApiKey: true,
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      // Solo 2: el resto del catálogo de Groq razona (gpt-oss, qwen3.8, muse-spark).
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    requiresApiKey: false,
    baseUrl: "http://localhost:11434",
    models: [
      "llama3.2",
      "qwen2.5",
      "phi4",
    ],
  },
];

export function getProviderById(id: string): ProviderConfig | undefined {
  return providers.find((p) => p.id === id);
}
