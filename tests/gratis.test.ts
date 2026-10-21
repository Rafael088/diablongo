// Modo gratis de POST /api/debate: key y modelo los pone el servidor (fetch sustituido, sin red).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/debate/route";
import { MODELOS_GRATIS, MODELOS_PAGO_DEL_SERVIDOR, MENSAJE_GRATIS_NO_DISPONIBLE, PROVEEDOR_GRATIS } from "@/lib/gratis";
import { providers } from "@/lib/providers";
import { SECRETO_PRUEBA, conToken } from "./ayudaToken";

const fetchMock = vi.fn();
const KEY_SERVIDOR = "sk-or-servidor-secreta-123";
const KEY_CLIENTE = "sk-cliente-no-debe-usarse";

const base = {
  topic: "¿Gatos o perros?",
  role: "pro",
  phase: "opening",
  provider: PROVEEDOR_GRATIS,
  history: [],
};

async function llamar(cuerpo: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/debate", { method: "POST", body: JSON.stringify(conToken(cuerpo)) })
  );
  return { status: res.status, texto: await res.text() };
}

function llamadaEnviada() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    auth: (init.headers as Record<string, string>)["Authorization"],
    cuerpo: JSON.parse(init.body as string) as { model: string; max_tokens: number },
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: " Hola " } }] }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("OPENROUTER_API_KEY", KEY_SERVIDOR);
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("MODELOS_GRATIS", () => {
  it("cada ID es :free o un modelo de pago aprobado, sin duplicados y Ángel y Diablo empiezan distinto", () => {
    const todos = [...MODELOS_GRATIS.pro, ...MODELOS_GRATIS.con];
    expect(todos.length).toBeGreaterThanOrEqual(3);
    for (const m of todos) expect(m.endsWith(":free") || MODELOS_PAGO_DEL_SERVIDOR.includes(m), m).toBe(true);
    // Cada personaje tiene al menos un :free de respaldo.
    for (const rol of ["pro", "con"] as const) expect(MODELOS_GRATIS[rol].some((m) => m.endsWith(":free")), rol).toBe(true);
    expect(new Set(todos).size).toBe(todos.length);
    expect(MODELOS_GRATIS.pro[0]).not.toBe(MODELOS_GRATIS.con[0]);
  });
});

describe("POST /api/debate en modo gratis", () => {
  it("usa la key del servidor y un modelo de MODELOS_GRATIS aunque el cliente mande otros", async () => {
    const { status, texto } = await llamar({ ...base, model: "anthropic/claude-haiku-5.5", apiKey: KEY_CLIENTE });
    expect(status).toBe(200);
    expect(JSON.parse(texto).content).toBe("Hola");
    const { url, auth, cuerpo } = llamadaEnviada();
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(auth).toBe(`Bearer ${KEY_SERVIDOR}`);
    expect(MODELOS_GRATIS.pro).toContain(cuerpo.model);
    expect(cuerpo.max_tokens).toBe(120);
  });

  it("Diablo usa un modelo de su lista", async () => {
    await llamar({ ...base, role: "con" });
    expect(MODELOS_GRATIS.con).toContain(llamadaEnviada().cuerpo.model);
  });

  it("funciona sin model ni apiKey", async () => {
    expect((await llamar(base)).status).toBe(200);
  });

  it("el cliente no elige el modelo en modo gratis: siempre el primero de la lista del servidor", async () => {
    const pago = providers.find((p) => p.id === "openrouter")!.models;
    for (const model of [...pago, "modelo-inventado", 42, { x: 1 }]) {
      fetchMock.mockClear();
      expect((await llamar({ ...base, model })).status).toBe(200);
      expect(llamadaEnviada().cuerpo.model).toBe(MODELOS_GRATIS.pro[0]);
    }
  });

  it("sin OPENROUTER_API_KEY en el servidor: 503 claro, sin llamadas y sin la key del cliente", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { status, texto } = await llamar({ ...base, apiKey: KEY_CLIENTE });
    expect(status).toBe(503);
    expect(JSON.parse(texto).error).toBe(MENSAJE_GRATIS_NO_DISPONIBLE);
    expect(texto).not.toContain(KEY_CLIENTE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si OpenRouter falla, el error no contiene la key del servidor", async () => {
    fetchMock.mockResolvedValue(new Response(`rechazada: ${KEY_SERVIDOR}`, { status: 401 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, texto } = await llamar(base);
    expect(status).toBe(500);
    expect(texto).not.toContain(KEY_SERVIDOR);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(KEY_SERVIDOR);
  });
});
