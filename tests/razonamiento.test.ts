// Respuestas cortadas por el razonamiento: cuerpo de la petición, reintento si el razonamiento es
// obligatorio, recorte a frases completas y la regla «cortada» del revisor de seguridad.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  TOPE_CON_RAZONAMIENTO,
  cuerpoChat,
  esRazonamientoObligatorio,
  leerRespuesta,
  textoUtil,
} from "@/lib/openrouter";
import { MAX_TOKENS_RESPUESTA } from "@/lib/topes";
import { providers } from "@/lib/providers";
import { MODELOS_CREDITOS } from "@/lib/creditosDebate";
import { revisarMensaje, terminaEnFrase } from "@/scripts/seguridad/revisor";
import { SECRETO_PRUEBA, conToken } from "./ayudaToken";

const gemini = vi.hoisted(() => ({ generateContent: vi.fn(), getGenerativeModel: vi.fn() }));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(config: unknown) {
      gemini.getGenerativeModel(config);
      return { generateContent: gemini.generateContent };
    }
  },
}));
import { POST } from "@/app/api/debate/route";

describe("cuerpo de la petición", () => {
  const base = { modelo: "m", system: "s", user: "u" };

  it("en OpenRouter apaga el razonamiento y usa el tope del juego", () => {
    const c = cuerpoChat({ ...base, openRouter: true });
    expect(c.reasoning).toEqual({ enabled: false });
    expect(c.max_tokens).toBe(MAX_TOKENS_RESPUESTA);
  });

  it("a Groq u Ollama no les manda `reasoning`", () => {
    expect(cuerpoChat({ ...base, openRouter: false })).not.toHaveProperty("reasoning");
  });

  it("si el razonamiento es obligatorio, sin el parámetro y con más margen", () => {
    const c = cuerpoChat({ ...base, openRouter: true, razonamientoObligatorio: true });
    expect(c).not.toHaveProperty("reasoning");
    expect(c.max_tokens).toBe(TOPE_CON_RAZONAMIENTO);
  });

  it("reconoce el 400 de razonamiento obligatorio (texto real de OpenRouter)", () => {
    const real = '{"error":{"message":"Reasoning is mandatory for this endpoint and cannot be disabled.","code":400}}';
    expect(esRazonamientoObligatorio(400, real)).toBe(true);
    expect(esRazonamientoObligatorio(400, "otra cosa")).toBe(false);
    expect(esRazonamientoObligatorio(429, real)).toBe(false);
  });
});

describe("texto útil de la respuesta", () => {
  it("si el modelo terminó solo, el texto va tal cual", () => {
    expect(textoUtil("  Hola, mortal  ", "stop")).toBe("Hola, mortal");
  });

  it("vacía no sirve", () => {
    expect(textoUtil("", "stop")).toBeNull();
    expect(textoUtil(null, "stop")).toBeNull();
  });

  it("cortada por longitud: se queda con las frases completas", () => {
    expect(textoUtil("¡Cómetelo sin culpa, mortal! Tu hermana ni se ente", "length")).toBe("¡Cómetelo sin culpa, mortal!");
    expect(textoUtil("Hazlo ya, que nadie mira… y además el pastel est", "length")).toBe("Hazlo ya, que nadie mira…");
    expect(textoUtil("«Ni lo pienses, de verdad.» Y luego", "length")).toBe("«Ni lo pienses, de verdad.»");
  });

  it("cortada sin ninguna frase completa de 3 palabras: no sirve (casos reales del informe)", () => {
    expect(textoUtil("¡Devóralo", "length")).toBeNull();
    expect(textoUtil("Tampoco me malinterpre", "length")).toBeNull();
    expect(textoUtil("Sí. Pero no", "length")).toBeNull();
  });

  it("lee choices[0] de /chat/completions", () => {
    expect(leerRespuesta({ choices: [{ message: { content: "Uno dos tres. cuat" }, finish_reason: "length" }] })).toBe(
      "Uno dos tres."
    );
    expect(leerRespuesta({})).toBeNull();
  });
});

describe("la regla «cortada» del revisor", () => {
  const diablo = { role: "con" as const, esDesenlace: false, critico: false };

  it("marca frases cortadas o demasiado cortas como no revisables", () => {
    for (const t of ["Tampoco me malinterpre", "no intro.", "El alado tiene razón por una"]) {
      expect(revisarMensaje(t, diablo).map((h) => h.tipo)).toContain("cortada");
    }
  });

  it("no marca frases completas, con comillas o emojis al final", () => {
    for (const t of ["¡Hazlo, que la vida es corta! 😈", "Piénsalo bien, «pequeño mortal».", "¿Y si mejor lo compartes?"]) {
      expect(terminaEnFrase(t)).toBe(true);
      expect(revisarMensaje(t, diablo).map((h) => h.tipo)).not.toContain("cortada");
    }
  });

  it("al desenlace solo le pide 3 palabras (es una frase de tarjeta)", () => {
    const desenlace = { ...diablo, esDesenlace: true };
    expect(revisarMensaje("Elegiste cuidarte: bien hecho", desenlace).map((h) => h.tipo)).not.toContain("cortada");
    expect(revisarMensaje("Elegiste", desenlace).map((h) => h.tipo)).toContain("cortada");
  });
});

describe("POST /api/debate con modelos que razonan", () => {
  const fetchMock = vi.fn();
  const cuerpos = () => fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
  const respuesta = (content: string, finish = "stop") =>
    new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status: 200 });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function llamar(provider: string, model: string) {
    const cuerpo = conToken({ topic: "¿Gatos o perros?", role: "pro", phase: "opening", provider, model, apiKey: "sk-x", history: [] });
    const res = await POST(new NextRequest("http://localhost/api/debate", { method: "POST", body: JSON.stringify(cuerpo) }));
    return { status: res.status, json: (await res.json()) as { content?: string; error?: string } };
  }
  const modeloDe = (id: string) => providers.find((p) => p.id === id)!.models[0];

  it("OpenRouter con key propia: pide el razonamiento apagado", async () => {
    fetchMock.mockResolvedValue(respuesta("Ni lo pienses, mortal."));
    const r = await llamar("openrouter", modeloDe("openrouter"));
    expect(r.json.content).toBe("Ni lo pienses, mortal.");
    expect(cuerpos()[0]).toMatchObject({ reasoning: { enabled: false }, max_tokens: MAX_TOKENS_RESPUESTA });
  });

  it("Groq no recibe el parámetro", async () => {
    fetchMock.mockResolvedValue(respuesta("Hola, hola, hola."));
    await llamar("groq", modeloDe("groq"));
    expect(cuerpos()[0]).not.toHaveProperty("reasoning");
  });

  it("si el modelo exige razonar, reintenta una vez sin el parámetro y con margen", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"error":{"message":"Reasoning is mandatory for this endpoint and cannot be disabled."}}', { status: 400 }))
      .mockResolvedValueOnce(respuesta("Tienes razón, pero piénsalo dos veces."));
    const r = await llamar("openrouter", modeloDe("openrouter"));
    expect(r.status).toBe(200);
    const [primero, segundo] = cuerpos();
    expect(primero.reasoning).toEqual({ enabled: false });
    expect(segundo).not.toHaveProperty("reasoning");
    expect(segundo.max_tokens).toBe(TOPE_CON_RAZONAMIENTO);
  });

  it("una respuesta cortada se recorta a sus frases completas", async () => {
    fetchMock.mockResolvedValue(respuesta("¡Cómetelo sin culpa, mortal! Tu hermana ni se ente", "length"));
    expect((await llamar("openrouter", modeloDe("openrouter"))).json.content).toBe("¡Cómetelo sin culpa, mortal!");
  });

  it("con key propia, cortada sin frase útil: error claro en vez de «¡Devóralo»", async () => {
    fetchMock.mockResolvedValue(respuesta("¡Devóralo", "length"));
    const r = await llamar("openrouter", modeloDe("openrouter"));
    expect(r.status).toBe(500);
    expect(r.json.error).toMatch(/no terminó la frase/);
  });

  it("Gemini directo: margen para razonar y recorte si Google corta por MAX_TOKENS", async () => {
    gemini.generateContent.mockResolvedValue({
      response: { text: () => "Hazlo ya, mortal. Y luego te cuen", candidates: [{ finishReason: "MAX_TOKENS" }] },
    });
    const r = await llamar("gemini", modeloDe("gemini"));
    expect(r.json.content).toBe("Hazlo ya, mortal.");
    expect(gemini.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ generationConfig: { maxOutputTokens: TOPE_CON_RAZONAMIENTO } })
    );
  });
});

describe("modelos del modo créditos", () => {
  it("ninguno de razonamiento obligatorio conocido (gemini-3.8-flash cortaba la frase)", () => {
    for (const m of [...MODELOS_CREDITOS.pro, ...MODELOS_CREDITOS.con]) expect(m).not.toBe("google/gemini-3.8-flash");
  });
});
