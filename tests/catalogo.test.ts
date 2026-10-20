// Migrado de scripts/comprobar-catalogo.ts (sin la opción --en-linea, que usa red).
import { describe, expect, it } from "vitest";
import { providers } from "../lib/providers.ts";

const RETIRADOS = [
  /claude-3(\.\d)?-/, /claude-2/, /gemini-1\.5/, /gemini-2\.0/, /gemini-2\.5/,
  /qwen-2\.5-32b/, /deepseek-r1-distill/, /gpt-4o/, /gpt-3\.5/,
];
const RAZONAMIENTO = [/(^|[^a-z0-9])r1([^a-z0-9]|$)/, /(^|[^a-z])o[134](-|$|\/)/, /thinking/, /qwq/, /reasoner/, /gpt-oss/, /muse-spark/];
// Groq solo ofrece 2 modelos sin razonamiento; ollama los instala el usuario.
const MINIMO: Record<string, number> = { ollama: 0, groq: 2 };

describe("catálogo de modelos", () => {
  for (const p of providers) {
    describe(p.id, () => {
      it("tiene los modelos mínimos", () => {
        expect(p.models.length).toBeGreaterThanOrEqual(MINIMO[p.id] ?? 3);
      });
      it("sin duplicados", () => {
        expect(new Set(p.models).size).toBe(p.models.length);
      });
      for (const m of p.models) {
        it(`${m}: ni retirado ni de razonamiento`, () => {
          const id = m.toLowerCase();
          expect(RETIRADOS.some((r) => r.test(id)), "modelo retirado").toBe(false);
          expect(RAZONAMIENTO.some((r) => r.test(id)), "modelo de razonamiento").toBe(false);
        });
      }
    });
  }

  it("openrouter cubre Claude, Gemini, GPT y un modelo abierto, con 2 por defecto", () => {
    const or = providers.find((p) => p.id === "openrouter");
    expect(or).toBeDefined();
    expect(or!.models.length).toBeGreaterThanOrEqual(2);
    for (const prefijo of ["anthropic/", "google/", "openai/"]) {
      expect(or!.models.some((m) => m.startsWith(prefijo)), prefijo).toBe(true);
    }
    expect(or!.models.some((m) => /^(meta-llama|qwen|mistralai|deepseek)\//.test(m))).toBe(true);
  });
});
