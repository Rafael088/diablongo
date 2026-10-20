// Pruebas de POST /api/debate: llama a la ruta real con fetch y Gemini sustituidos (sin red).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/debate/route";
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

async function llamar(cuerpo: unknown) {
  const res = await POST(peticion(cuerpo));
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
});

afterEach(() => {
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
