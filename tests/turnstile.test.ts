// Turnstile en POST /api/debate/start: siteverify simulado (sin red), almacén en memoria.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as START } from "@/app/api/debate/start/route";
import { AlmacenMemoria, usarAlmacen } from "@/lib/almacen";
import {
  MENSAJE_TURNSTILE_RECHAZADO,
  MENSAJE_TURNSTILE_SIN_CONFIGURAR,
  URL_SITEVERIFY,
} from "@/lib/turnstile";
import { providers } from "@/lib/providers";
import { SECRETO_PRUEBA, TURNSTILE_PRUEBA, simularTurnstile } from "./ayudaToken";

const SECRETO_TS = "secreto-turnstile-de-prueba";
let almacen: AlmacenMemoria;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
  vi.stubEnv("OPENROUTER_API_KEY", "sk-x");
  almacen = new AlmacenMemoria();
  usarAlmacen(almacen);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  usarAlmacen(undefined);
});

const gratis = { provider: "gratis", model: "" };
const conKey = { provider: "openrouter", model: providers.find((p) => p.id === "openrouter")!.models[0] };

async function start(extra: Record<string, unknown> = { turnstile: TURNSTILE_PRUEBA }, modo = gratis) {
  const res = await START(
    new NextRequest("http://localhost/api/debate/start", {
      method: "POST",
      headers: { "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({ topic: "¿Gatos o perros?", pro: modo, con: modo, ...extra }),
    })
  );
  return { status: res.status, texto: await res.text() };
}

describe("guardiaTurnstile", () => {
  it("token válido: emite el token del debate, consume cupo y manda secreto, response e IP a siteverify", async () => {
    const mock = simularTurnstile();
    const { status, texto } = await start();
    expect(status).toBe(200);
    const d = JSON.parse(texto);
    expect(typeof d.token).toBe("string");
    expect(d.quedan).toBe(2);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_SITEVERIFY);
    expect(init.method).toBe("POST");
    const form = init.body as URLSearchParams;
    expect(form.get("secret")).toBe(SECRETO_TS);
    expect(form.get("response")).toBe(TURNSTILE_PRUEBA);
    expect(form.get("remoteip")).toBe("9.9.9.9");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("token inválido: 403, no firma ni consume cupo", async () => {
    simularTurnstile({ success: false, "error-codes": ["invalid-input-response"] });
    const { status, texto } = await start();
    expect(status).toBe(403);
    const d = JSON.parse(texto);
    expect(d.error).toBe(MENSAJE_TURNSTILE_RECHAZADO);
    expect(d.token).toBeUndefined();
    expect(almacen.claves()).toEqual([]);
  });

  it("sin token (o no es texto): 403 y ni siquiera llama a siteverify", async () => {
    const mock = simularTurnstile();
    for (const cuerpo of [{}, { turnstile: "" }, { turnstile: 5 }, { turnstile: "x".repeat(5000) }]) {
      const { status, texto } = await start(cuerpo);
      expect(status).toBe(403);
      expect(JSON.parse(texto).error).toBe(MENSAJE_TURNSTILE_RECHAZADO);
    }
    expect(mock).not.toHaveBeenCalled();
    expect(almacen.claves()).toEqual([]);
  });

  it("action distinta: 403 sin consumir cupo", async () => {
    simularTurnstile({ success: true, action: "otra-cosa" });
    expect((await start()).status).toBe(403);
    simularTurnstile({ success: true });
    expect((await start()).status).toBe(403);
    expect(almacen.claves()).toEqual([]);
  });

  it("TURNSTILE_HOSTNAME: si no coincide, 403; si coincide, pasa", async () => {
    vi.stubEnv("TURNSTILE_HOSTNAME", "agent-debate.vercel.app");
    simularTurnstile({ success: true, action: "iniciar-debate", hostname: "otro.com" });
    expect((await start()).status).toBe(403);
    simularTurnstile({ success: true, action: "iniciar-debate", hostname: "agent-debate.vercel.app" });
    expect((await start()).status).toBe(200);
  });

  it("claves de prueba de Cloudflare (sin action, con result_with_testing_key): pasa", async () => {
    simularTurnstile({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
    expect((await start()).status).toBe(200);
  });

  it("red caída, HTTP de error o JSON roto: 503 y no consume cupo", async () => {
    simularTurnstile();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect((await start()).status).toBe(503);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect((await start()).status).toBe(503);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no es json", { status: 200 })));
    const { status, texto } = await start();
    expect(status).toBe(503);
    expect(JSON.parse(texto).token).toBeUndefined();
    expect(almacen.claves()).toEqual([]);
  });

  it("sin TURNSTILE_SECRET_KEY en production (o test): 503 y no consume cupo", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const { status, texto } = await start();
    expect(status).toBe(503);
    expect(JSON.parse(texto).error).toBe(MENSAJE_TURNSTILE_SIN_CONFIGURAR);
    expect(almacen.claves()).toEqual([]);
  });

  it("sin TURNSTILE_SECRET_KEY en development: se omite con aviso y pasa", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    const { status } = await start({});
    expect(status).toBe(200);
    expect(mock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("también se exige con key de usuario (todos los modos)", async () => {
    const mock = simularTurnstile({ success: false });
    expect((await start({ turnstile: TURNSTILE_PRUEBA }, conKey)).status).toBe(403);
    expect((await start({}, conKey)).status).toBe(403);
    simularTurnstile();
    const ok = await start({ turnstile: TURNSTILE_PRUEBA }, conKey);
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.texto).quedan).toBeUndefined();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("el secreto de Turnstile nunca aparece en ninguna respuesta", async () => {
    const respuestas: string[] = [];
    simularTurnstile();
    respuestas.push((await start()).texto);
    simularTurnstile({ success: false });
    respuestas.push((await start()).texto);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`falló con ${SECRETO_TS}`)));
    respuestas.push((await start()).texto);
    for (const t of respuestas) expect(t).not.toContain(SECRETO_TS);
  });
});
