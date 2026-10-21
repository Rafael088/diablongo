// Revisión de cada frase del Diablo (lib/revisarFrase.ts) y su uso en POST /api/debate.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  INSTRUCCION_REHACER,
  PROMPT_REVISOR,
  conRevision,
  fraseSegura,
  revisarFrase,
  type Buscar,
  type Veredicto,
} from "@/lib/revisarFrase";
import { MAX_WORDS, MAX_WORDS_DESENLACE } from "@/lib/prompts";
import { TURN_PLAN, TOTAL_TURNS } from "@/lib/debateEngine";
import { providers } from "@/lib/providers";
import { SECRETO_PRUEBA, conToken } from "./ayudaToken";
import { POST } from "@/app/api/debate/route";

const responde = (content: string, status = 200): Buscar =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));

describe("revisarFrase", () => {
  it("solo SEGURA es segura; INSEGURA o cualquier explicación cuenta como insegura", async () => {
    expect(await revisarFrase("x", "t", "sk", responde("SEGURA"))).toBe("segura");
    expect(await revisarFrase("x", "t", "sk", responde("Segura."))).toBe("segura");
    expect(await revisarFrase("x", "t", "sk", responde("INSEGURA"))).toBe("insegura");
    expect(await revisarFrase("x", "t", "sk", responde("Esta frase anima a"))).toBe("insegura");
  });

  it("sin key, error o respuesta vacía: null (no se pudo revisar)", async () => {
    expect(await revisarFrase("x", "t", undefined, responde("SEGURA"))).toBeNull();
    expect(await revisarFrase("x", "t", "sk", responde("SEGURA", 500))).toBeNull();
    expect(await revisarFrase("x", "t", "sk", responde("  "))).toBeNull();
    const caido: Buscar = async () => {
      throw new Error("red");
    };
    expect(await revisarFrase("x", "t", "sk", caido)).toBeNull();
  });

  it("manda tema y frase, una palabra, sin razonar", async () => {
    const buscar = responde("SEGURA");
    await revisarFrase("Pásala por el datáfono", "¿Uso la tarjeta que encontré?", "sk", buscar);
    const cuerpo = JSON.parse(String((vi.mocked(buscar).mock.calls[0][1] as RequestInit).body));
    expect(cuerpo).toMatchObject({ max_tokens: 5, temperature: 0, reasoning: { enabled: false } });
    expect(cuerpo.messages[0].content).toBe(PROMPT_REVISOR);
    expect(cuerpo.messages[1].content).toContain("¿Uso la tarjeta que encontré?");
    expect(cuerpo.messages[1].content).toContain("Pásala por el datáfono");
  });
});

describe("conRevision", () => {
  const veredictos = (...v: (Veredicto | null)[]) => {
    const cola = [...v];
    return vi.fn(async () => cola.shift() ?? null);
  };

  it("segura o sin revisor: la frase original, sin pedir otra", async () => {
    for (const v of ["segura", null] as const) {
      const rehacer = vi.fn(async () => "otra");
      expect(await conRevision({ frase: "f", revisar: veredictos(v), rehacer, esDesenlace: false, indice: 1 })).toEqual({
        texto: "f",
        cambio: "ninguno",
      });
      expect(rehacer).not.toHaveBeenCalled();
    }
  });

  it("insegura y la nueva es segura: la nueva", async () => {
    const r = await conRevision({ frase: "mala", revisar: veredictos("insegura", "segura"), rehacer: async () => "buena", esDesenlace: false, indice: 1 });
    expect(r).toEqual({ texto: "buena", cambio: "rehecha" });
  });

  it("insegura dos veces, sin nueva, o la nueva sin revisar: la de respaldo", async () => {
    for (const [revisar, rehacer] of [
      [veredictos("insegura", "insegura"), async () => "mala otra vez"],
      [veredictos("insegura"), async () => null],
      [veredictos("insegura", null), async () => "sin revisar"],
      [veredictos("insegura"), async () => Promise.reject(new Error("caído"))],
    ] as const) {
      const r = await conRevision({ frase: "mala", revisar, rehacer, esDesenlace: false, indice: 2 });
      expect(r).toEqual({ texto: fraseSegura(false, 2), cambio: "respaldo" });
    }
  });

  it("las frases de respaldo caben en los topes del juego", () => {
    for (let i = 0; i < 6; i++) expect(fraseSegura(false, i).split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS);
    expect(fraseSegura(true).split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS_DESENLACE);
  });
});

describe("POST /api/debate: el Diablo pasa por el revisor", () => {
  const fetchMock = vi.fn();
  let modelo: string[];
  let revisor: string[];

  beforeEach(() => {
    modelo = [];
    revisor = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body)) as { messages: { content: string }[] };
      if (cuerpo.messages[0].content === PROMPT_REVISOR) {
        const v = revisor.shift() ?? "SEGURA";
        return new Response(JSON.stringify({ choices: [{ message: { content: v } }] }), { status: 200 });
      }
      const texto = modelo.shift() ?? "Frase normal del modelo.";
      return new Response(JSON.stringify({ choices: [{ message: { content: texto }, finish_reason: "stop" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-servidor");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const indiceDiablo = TURN_PLAN.findIndex((t) => t.nextSpeaker === "con");
  const indiceAngel = TURN_PLAN.findIndex((t) => t.nextSpeaker === "pro");

  async function turno(indice: number) {
    const plan = TURN_PLAN[indice];
    const cuerpo = conToken({
      topic: "¿Uso la tarjeta que encontré en la calle?",
      role: plan.nextSpeaker,
      phase: plan.phase,
      provider: "openrouter",
      model: providers.find((p) => p.id === "openrouter")!.models[0],
      apiKey: "sk-usuario",
      history: [],
    });
    const res = await POST(new NextRequest("http://localhost/api/debate", { method: "POST", body: JSON.stringify(cuerpo) }));
    return { status: res.status, json: (await res.json()) as { content?: string } };
  }

  it("frase insegura: se pide otra al mismo modelo con el aviso y se muestra la nueva", async () => {
    modelo = ["Pásala por el datáfono del quiosco y la tiras.", "Mejor invítate una pizza con tu plata."];
    revisor = ["INSEGURA", "SEGURA"];
    const r = await turno(indiceDiablo);
    expect(r.status).toBe(200);
    expect(r.json.content).toBe("Mejor invítate una pizza con tu plata.");
    const pedidos = fetchMock.mock.calls
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)))
      .filter((b) => b.messages[0].content !== PROMPT_REVISOR);
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1].messages[1].content.endsWith(INSTRUCCION_REHACER)).toBe(true);
  });

  it("insegura dos veces: frase de respaldo, nunca la original", async () => {
    modelo = ["Pásala por el datáfono.", "Úsala en el quiosco, nadie se entera."];
    revisor = ["INSEGURA", "INSEGURA"];
    const r = await turno(indiceDiablo);
    expect(r.status).toBe(200);
    expect(r.json.content).toBe(fraseSegura(false, indiceDiablo));
  });

  it("el Ángel no pasa por el revisor", async () => {
    await turno(indiceAngel);
    const alRevisor = fetchMock.mock.calls.filter((c) => String((c[1] as RequestInit).body).includes(PROMPT_REVISOR.slice(0, 40)));
    expect(alRevisor).toHaveLength(0);
  });

  it("si el revisor no responde, se muestra la frase (y el turno sigue)", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body)) as { messages: { content: string }[] };
      if (cuerpo.messages[0].content === PROMPT_REVISOR) return new Response("caído", { status: 500 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Date un gusto con pizza." }, finish_reason: "stop" }] }), { status: 200 });
    });
    const r = await turno(indiceDiablo);
    expect(r.json.content).toBe("Date un gusto con pizza.");
  });

  it("el desenlace del Diablo también se revisa (respaldo de desenlace)", async () => {
    modelo = ["Elegiste al Diablito: chicles gratis con la tarjeta ajena.", "Elegiste al Diablito: compras con la tarjeta, nadie se enteró."];
    revisor = ["INSEGURA", "INSEGURA"];
    const cuerpo = conToken({
      topic: "¿Uso la tarjeta que encontré en la calle?",
      role: "con",
      phase: "desenlace",
      provider: "openrouter",
      model: providers.find((p) => p.id === "openrouter")!.models[0],
      apiKey: "sk-usuario",
      history: [],
    });
    expect(cuerpo.indice).toBe(TOTAL_TURNS);
    const res = await POST(new NextRequest("http://localhost/api/debate", { method: "POST", body: JSON.stringify(cuerpo) }));
    expect(((await res.json()) as { content: string }).content).toBe(fraseSegura(true));
  });
});
