import type { ProviderConfig } from "@/types";

export const providers: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    requiresApiKey: true,
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "openai/gpt-4o",
      "anthropic/claude-3.7-sonnet",
      "google/gemini-2.5-flash",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    requiresApiKey: true,
    models: [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ],
  },
  {
    id: "groq",
    name: "Groq",
    requiresApiKey: true,
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      "llama-3.3-70b-versatile",
      "qwen-2.5-32b",
      "deepseek-r1-distill-llama-70b",
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
