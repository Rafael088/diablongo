// Pruebas de POST /api/debate: llama a la ruta real con fetch y Gemini sustituidos (sin red).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/debate/route";
import { POST as START } from "@/app/api/debate/start/route";
import { TOTAL_LLAMADAS, TOTAL_TURNS, TURN_PLAN } from "@/lib/debateEngine";
import { DURACION_TOKEN_MS, MENSAJE_SIN_SECRETO } from "@/lib/tokenDebate";
import { providers } from "@/lib/providers";
import {
  MAX_CUERPO_BYTES,
  MAX_INTERVENCION,
  MAX_INTERVENCIONES_USUARIO,
  MAX_MENSAJE_HISTORIAL,
  MAX_MENSAJES_HISTORIAL,
  MAX_TEMA,
  MAX_TOKENS_RESPUESTA,
} from "@/lib/topes";
import { SECRETO_PRUEBA, conToken } from "./ayudaToken";

const gemini = vi.hoisted(() => ({
  generateContent: vi.fn(),
  getGenerativeModel: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(apiKey: string) {
      gemini.constructor(apiKey);
    }
    getGenerativeModel(config: unknown) {
      gemini.getGenerativeModel(config);
      return { generateContent: gemini.generateContent };
    }
  },
}));

const fetchMock = vi.fn();

function modelosDe(id: string): string[] {
  return providers.find((p) => p.id === id)!.models;
}

const base = {
  topic: "¿Gatos o perros?",
  role: "pro",
  phase: "opening",
  provider: "openrouter",
  model: modelosDe("openrouter")[0],
  apiKey: "sk-clave-de-prueba",
  history: [{ role: "user", content: "hola" }],
};

function peticion(cuerpo: unknown): NextRequest {
  const body = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  return new NextRequest("http://localhost/api/debate", { method: "POST", body });
}

/** Turno con token válido del debate (las pruebas de token están más abajo y en token.test.ts). */
async function llamar(cuerpo: unknown) {
  const conPermiso = typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo)
    ? conToken(cuerpo as Record<string, unknown>)
    : cuerpo;
  const res = await POST(peticion(conPermiso));
  return { status: res.status, json: (await res.json()) as { error?: string; content?: string } };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: "  Respuesta del modelo  " } }] }), { status: 200 })
  );
  gemini.generateContent.mockReset();
  gemini.generateContent.mockResolvedValue({ response: { text: () => " Hola desde Gemini " } });
  gemini.getGenerativeModel.mockReset();
  gemini.constructor.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/debate: rechaza antes de llamar al proveedor", () => {
  async function rechaza(cuerpo: unknown, status = 400, secreto?: string) {
    const { status: s, json } = await llamar(cuerpo);
    expect(s).toBe(status);
    expect(json.error).toBeTruthy();
    if (secreto) expect(json.error).not.toContain(secreto);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gemini.generateContent).not.toHaveBeenCalled();
  }

  it("modelo fuera de lista: 400, sin llamadas y sin repetir el modelo", async () => {
    await rechaza({ ...base, model: "modelo-inventado-xyz" }, 400, "modelo-inventado-xyz");
  });

  it("modelo de otro proveedor: 400", async () => {
    const ajeno = modelosDe("groq")[0];
    await rechaza({ ...base, model: ajeno }, 400, ajeno);
  });

  it("proveedor desconocido: 400", async () => {
    await rechaza({ ...base, provider: "proveedor-raro" }, 400, "proveedor-raro");
  });

  it("ollama con NODE_ENV production: 400 y sin llamadas", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await rechaza(
      { ...base, provider: "ollama", model: modelosDe("ollama")[0], apiKey: "" },
      400,
      "ollama"
    );
  });

  it("tema de 201 caracteres: 400", async () => {
    await rechaza({ ...base, topic: "x".repeat(MAX_TEMA + 1) });
  });

  it("intervención demasiado larga: 400", async () => {
    await rechaza({ ...base, intervention: "x".repeat(MAX_INTERVENCION + 1) });
  });

  it("mensaje de historial demasiado largo: 400", async () => {
    await rechaza({ ...base, history: [{ role: "pro", content: "x".repeat(MAX_MENSAJE_HISTORIAL + 1) }] });
  });

  it("historial con demasiados mensajes: 400", async () => {
    const history = Array.from({ length: MAX_MENSAJES_HISTORIAL + 1 }, (_, i) => ({ role: i % 2 ? "pro" : "con", content: "a" }));
    await rechaza({ ...base, history });
  });

  it("historial con demasiadas intervenciones del usuario: 400", async () => {
    const history = Array.from({ length: MAX_INTERVENCIONES_USUARIO + 1 }, () => ({ role: "user", content: "a" }));
    await rechaza({ ...base, history });
  });

  it("falta la clave de API: 400", async () => {
    await rechaza({ ...base, apiKey: "" });
  });

  it("cuerpo mayor de 16 KB: 413", async () => {
    const grande = { ...base, relleno: "x".repeat(MAX_CUERPO_BYTES) };
    await rechaza(grande, 413);
  });

  it("cuerpo que no es JSON: 400", async () => {
    await rechaza("esto no es json {", 400);
  });

  it("cuerpo JSON que no es un objeto: 400", async () => {
    await rechaza("[1,2,3]", 400);
  });
});

describe("POST /api/debate: caso válido", () => {
  it("OpenRouter: 200 con el contenido, max_tokens fijo, modelo exacto y Authorization", async () => {
    const { status, json } = await llamar({ ...base, intervention: "ojo" });
    expect(status).toBe(200);
    expect(json.content).toBe("Respuesta del modelo");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${base.apiKey}`);
    const enviado = JSON.parse(init.body as string);
    expect(enviado.max_tokens).toBe(MAX_TOKENS_RESPUESTA);
    expect(enviado.model).toBe(base.model);
  });

  it("el cliente no puede subir max_tokens", async () => {
    await llamar({ ...base, max_tokens: 99999, maxTokens: 99999 });
    const enviado = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(enviado.max_tokens).toBe(MAX_TOKENS_RESPUESTA);
  });

  it("Groq usa su propia URL y modelo", async () => {
    const model = modelosDe("groq")[0];
    const { status } = await llamar({ ...base, provider: "groq", model });
    expect(status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(JSON.parse(init.body as string).model).toBe(model);
  });

  it("Ollama en development: 200 y sin Authorization", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { status } = await llamar({ ...base, provider: "ollama", model: modelosDe("ollama")[0], apiKey: "" });
    expect(status).toBe(200);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("Gemini: 200, usa el SDK (no fetch) con maxOutputTokens fijo", async () => {
    const model = modelosDe("gemini")[0];
    const { status, json } = await llamar({ ...base, provider: "gemini", model });
    expect(status).toBe(200);
    expect(json.content).toBe("Hola desde Gemini");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gemini.constructor).toHaveBeenCalledWith(base.apiKey);
    expect(gemini.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model, generationConfig: { maxOutputTokens: MAX_TOKENS_RESPUESTA } })
    );
  });
});

describe("POST /api/debate: fallos del proveedor", () => {
  it("si el proveedor responde error: 500 sin reflejar el modelo ni la clave enviados", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("upstream roto", { status: 502 }));
    const { status, json } = await llamar(base);
    expect(status).toBe(500);
    expect(json.error).toBeTruthy();
    expect(json.error).not.toContain(base.apiKey);
    expect(json.error).not.toContain(base.model);
  });
});

// ------------------------------------------------------------------ token del debate

/** Turno tal cual, sin añadirle token (para probar el token). */
async function crudo(cuerpo: unknown) {
  const res = await POST(peticion(cuerpo));
  return { status: res.status, texto: await res.text() };
}

const configDebate = {
  topic: base.topic,
  pro: { provider: "openrouter", model: base.model },
  con: { provider: "groq", model: modelosDe("groq")[0] },
};

async function empezar(config: unknown = configDebate): Promise<string> {
  // siteverify va aparte: el fetchMock de los proveedores no debe ver esa llamada.
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto-turnstile-de-prueba");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, action: "iniciar-debate" }))));
  const cuerpo = { turnstile: "token-turnstile-de-prueba", ...(config as object) };
  let res: Response;
  try {
    res = await START(
      new NextRequest("http://localhost/api/debate/start", { method: "POST", body: JSON.stringify(cuerpo) })
    );
  } finally {
    vi.stubGlobal("fetch", fetchMock);
  }
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

/** Cuerpo del turno `indice` del debate de configDebate (8 = desenlace de Diablo). */
function turno(token: string, indice: number, cambios: Record<string, unknown> = {}) {
  const plan = TURN_PLAN[indice];
  const role = plan ? plan.nextSpeaker : "con";
  const debater = configDebate[role];
  return {
    token,
    indice,
    topic: configDebate.topic,
    role,
    phase: plan ? plan.phase : "desenlace",
    provider: debater.provider,
    model: debater.model,
    apiKey: "sk-clave-de-prueba",
    history: [],
    ...cambios,
  };
}

describe("POST /api/debate: token del debate", () => {
  beforeEach(() => {
    // Una Response nueva por llamada (el cuerpo solo se lee una vez).
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
    );
  });

  async function rechazaToken(cuerpo: unknown, status: number) {
    const { status: s, texto } = await crudo(cuerpo);
    expect(s).toBe(status);
    expect(JSON.parse(texto).error).toBeTruthy();
    expect(texto).not.toContain("sk-clave-de-prueba");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gemini.generateContent).not.toHaveBeenCalled();
    return JSON.parse(texto).error as string;
  }

  it("flujo completo: las 9 llamadas (8 turnos + desenlace) se aceptan", async () => {
    const token = await empezar();
    for (let i = 0; i < TOTAL_LLAMADAS; i++) {
      const { status } = await crudo(turno(token, i));
      expect(status, `llamada ${i + 1}`).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(TOTAL_LLAMADAS);
  });

  it("décima llamada (índice 9) o índice raro: 400 y sin llamar al proveedor", async () => {
    const token = await empezar();
    for (let i = 0; i < TOTAL_LLAMADAS; i++) await crudo(turno(token, i));
    fetchMock.mockClear();
    await rechazaToken(turno(token, TOTAL_LLAMADAS, { role: "con", phase: "desenlace" }), 400);
    for (const indice of [-1, 1.5, "0", null, undefined, 1e9]) {
      await rechazaToken(turno(token, 0, { indice }), 400);
    }
  });

  it("índice repetido: 409 y sin llamar al proveedor", async () => {
    const token = await empezar();
    expect((await crudo(turno(token, 0))).status).toBe(200);
    fetchMock.mockClear();
    await rechazaToken(turno(token, 0), 409);
  });

  it("el desenlace solo se juega una vez aunque se cambie de personaje", async () => {
    const token = await empezar();
    expect((await crudo(turno(token, TOTAL_TURNS))).status).toBe(200);
    fetchMock.mockClear();
    await rechazaToken(
      turno(token, TOTAL_TURNS, { role: "pro", provider: "openrouter", model: base.model }),
      409
    );
  });

  it("rol o fase que no corresponde al índice: 400", async () => {
    const token = await empezar();
    await rechazaToken(turno(token, 0, { role: "con", provider: "groq", model: configDebate.con.model }), 400);
    await rechazaToken(turno(token, 0, { phase: "closing" }), 400);
    await rechazaToken(turno(token, 3, { phase: "desenlace" }), 400);
    await rechazaToken(turno(token, TOTAL_TURNS, { phase: "closing" }), 400);
  });

  it("cambiar de modelo, de proveedor o de tema a mitad: rechazo sin reflejarlo", async () => {
    const token = await empezar();
    expect((await crudo(turno(token, 0))).status).toBe(200);
    fetchMock.mockClear();
    const otroModelo = modelosDe("openrouter")[1];
    const error = await rechazaToken(turno(token, 2, { model: otroModelo }), 403);
    expect(error).not.toContain(otroModelo);
    await rechazaToken(turno(token, 2, { provider: "groq", model: configDebate.con.model }), 403);
    const e2 = await rechazaToken(turno(token, 2, { topic: "Otro tema secreto" }), 403);
    expect(e2).not.toContain("Otro tema secreto");
    // El turno 2 sigue libre: los rechazos no lo consumen.
    expect((await crudo(turno(token, 2))).status).toBe(200);
  });

  it("sin token, con basura o manipulado: 401", async () => {
    const token = await empezar();
    const [p, f] = token.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    const p2 = Buffer.from(JSON.stringify({ ...payload, n: 50 })).toString("base64url");
    const otraFirma = f[0] === "A" ? `B${f.slice(1)}` : `A${f.slice(1)}`;
    const sinToken: Record<string, unknown> = turno(token, 0);
    delete sinToken.token;
    await rechazaToken(sinToken, 401);
    for (const malo of ["basura", `${p2}.${f}`, `${p}.${otraFirma}`, 123, ["a"]]) {
      await rechazaToken(turno(token, 0, { token: malo }), 401);
    }
  });

  it("token caducado: 401", async () => {
    vi.useFakeTimers();
    const token = await empezar();
    vi.advanceTimersByTime(DURACION_TOKEN_MS + 1);
    const error = await rechazaToken(turno(token, 0), 401);
    expect(error).toMatch(/caduc/);
  });

  it("sin DEBATE_TOKEN_SECRET: 503 antes de mirar nada", async () => {
    const token = await empezar();
    vi.stubEnv("DEBATE_TOKEN_SECRET", "");
    const error = await rechazaToken(turno(token, 0), 503);
    expect(error).toBe(MENSAJE_SIN_SECRETO);
  });

  it("si el proveedor falla, el turno se puede reintentar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const token = await empezar();
    fetchMock.mockResolvedValueOnce(new Response("caído", { status: 502 }));
    expect((await crudo(turno(token, 0))).status).toBe(500);
    expect((await crudo(turno(token, 0))).status).toBe(200);
    expect((await crudo(turno(token, 0))).status).toBe(409);
  });
});
