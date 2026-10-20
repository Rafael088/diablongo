// Migrado a tests/catalogo.test.ts; este script se mantiene por compatibilidad
// Comprueba el catálogo de lib/providers.ts.
// Uso: node scripts/comprobar-catalogo.ts [--en-linea]
import { providers } from "../lib/providers.ts";

const errores: string[] = [];
const afirmar = (c: boolean, m: string) => {
  if (!c) errores.push(m);
};

const RETIRADOS = [
  /claude-3(\.\d)?-/, /claude-2/, /gemini-1\.5/, /gemini-2\.0/, /gemini-2\.5/,
  /qwen-2\.5-32b/, /deepseek-r1-distill/, /gpt-4o/, /gpt-3\.5/,
];
const RAZONAMIENTO = [/(^|[^a-z0-9])r1([^a-z0-9]|$)/, /(^|[^a-z])o[134](-|$|\/)/, /thinking/, /qwq/, /reasoner/, /gpt-oss/, /muse-spark/];
// Groq solo ofrece 2 modelos sin razonamiento; ollama los instala el usuario.
const MINIMO: Record<string, number> = { ollama: 0, groq: 2 };

const vistos = new Set<string>();
for (const p of providers) {
  afirmar(p.models.length >= (MINIMO[p.id] ?? 3), `${p.id}: tiene ${p.models.length} modelos, faltan`);
  for (const m of p.models) {
    const id = m.toLowerCase();
    afirmar(!RETIRADOS.some((r) => r.test(id)), `${p.id}/${m}: modelo retirado`);
    afirmar(!RAZONAMIENTO.some((r) => r.test(id)), `${p.id}/${m}: modelo de razonamiento`);
    afirmar(!vistos.has(`${p.id}/${m}`), `${p.id}/${m}: duplicado`);
    vistos.add(`${p.id}/${m}`);
  }
}

const or = providers.find((p) => p.id === "openrouter");
afirmar(!!or, "falta openrouter");
afirmar((or?.models.length ?? 0) >= 2, "openrouter necesita 2 modelos por defecto (Ángel y Diablo)");
for (const [prefijo, nombre] of [["anthropic/", "Claude"], ["google/", "Gemini"], ["openai/", "GPT"]] as const) {
  afirmar(!!or?.models.some((m) => m.startsWith(prefijo)), `openrouter sin ${nombre}`);
}
afirmar(!!or?.models.some((m) => /^(meta-llama|qwen|mistralai|deepseek)\//.test(m)), "openrouter sin modelo abierto");

if (process.argv.includes("--en-linea")) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    afirmar(r.ok, `OpenRouter respondió ${r.status}`);
    const ids = new Set(((await r.json()) as { data: { id: string }[] }).data.map((m) => m.id));
    for (const m of or?.models ?? []) {
      afirmar(ids.has(m), `openrouter/${m}: no existe en OpenRouter`);
      if (ids.has(m)) console.log(`en línea ok: ${m}`);
    }
  } catch (e) {
    afirmar(false, `no se pudo consultar OpenRouter: ${(e as Error).message}`);
  }
}

if (errores.length) {
  console.error("FALLOS:\n- " + errores.join("\n- "));
  process.exit(1);
}
console.log("comprobar-catalogo: todo bien");
