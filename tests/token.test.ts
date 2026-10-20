// Token del debate: firma, verificación, caducidad y POST /api/debate/start (sin red).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as START } from "@/app/api/debate/start/route";
import { TOTAL_LLAMADAS } from "@/lib/debateEngine";
import { PROVEEDOR_GRATIS } from "@/lib/gratis";
import { providers } from "@/lib/providers";
import { RegistroTurnosMemoria } from "@/lib/registroTurnos";
import { GUARDIAS_INICIO } from "@/lib/guardiasInicio";
import {
  DURACION_TOKEN_MS,
  MENSAJE_SIN_SECRETO,
  MENSAJE_TOKEN_EXPIRADO,
  emitirToken,
  firmarPayload,
  obtenerSecreto,
  verificarToken,
  type ConfigInicio,
  type PayloadToken,
} from "@/lib/tokenDebate";
import { SECRETO_PRUEBA } from "./ayudaToken";

const secreto = Buffer.from(SECRETO_PRUEBA);
const modelo = providers.find((p) => p.id === "openrouter")!.models[0];
const TEMA = "¿Deberían los robots pagar impuestos?";
const config: ConfigInicio = {
  topic: TEMA,
  pro: { provider: "openrouter", model: modelo },
  con: { provider: PROVEEDOR_GRATIS, model: "" },
};

function partes(token: string) {
  const [p, f] = token.split(".");
  return { p, f, payload: JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as PayloadToken };
}

async function start(cuerpo: unknown) {
  const body = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const res = await START(new NextRequest("http://localhost/api/debate/start", { method: "POST", body }));
  return { status: res.status, texto: await res.text() };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  GUARDIAS_INICIO.length = 0;
});

describe("firma y verificación", () => {
  it("un token recién emitido se verifica y trae el plan del debate", () => {
    const { token, payload } = emitirToken(config, secreto);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    const r = verificarToken(token, secreto);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual(payload);
    expect(r.payload.n).toBe(TOTAL_LLAMADAS);
    expect(r.payload.pro).toEqual({ pr: "openrouter", mo: modelo });
    expect(r.payload.con).toEqual({ pr: PROVEEDOR_GRATIS, mo: "" });
    expect(r.payload.exp - r.payload.iat).toBe(DURACION_TOKEN_MS);
  });

  it("cada token tiene un id de debate distinto", () => {
    expect(emitirToken(config, secreto).payload.id).not.toBe(emitirToken(config, secreto).payload.id);
  });

  it("el token no contiene el tema en claro ni ninguna clave", () => {
    const { token } = emitirToken(config, secreto);
    const decodificado = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    for (const texto of [token, decodificado]) {
      expect(texto).not.toContain(TEMA);
      expect(texto).not.toContain("robots");
      expect(texto).not.toContain(SECRETO_PRUEBA);
      expect(texto.toLowerCase()).not.toContain("apikey");
    }
  });

  it("payload manipulado (cambiar el modelo o subir n) con la firma vieja: inválido", () => {
    const { token } = emitirToken(config, secreto);
    const { f, payload } = partes(token);
    for (const cambio of [{ n: 99 }, { pro: { pr: "openrouter", mo: "otro/modelo" } }, { exp: payload.exp + 1e9 }]) {
      const p2 = Buffer.from(JSON.stringify({ ...payload, ...cambio })).toString("base64url");
      const r = verificarToken(`${p2}.${f}`, secreto);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("invalido");
    }
  });

  it("firma manipulada, truncada, de otro secreto o con formato raro: inválido", () => {
    const { token } = emitirToken(config, secreto);
    const { p, f } = partes(token);
    const otra = f[0] === "A" ? `B${f.slice(1)}` : `A${f.slice(1)}`;
    const casos: unknown[] = [
      `${p}.${otra}`,
      `${p}.${f.slice(0, 20)}`,
      `${p}.`,
      p,
      `${p}.${f}.extra`,
      `${p}.${f}=`,
      emitirToken(config, Buffer.from("otro-secreto-distinto-con-mas-de-32-bytes!!")).token,
      42,
      { token },
      "x".repeat(5000),
    ];
    for (const c of casos) {
      const r = verificarToken(c, secreto);
      expect(r.ok, String(c).slice(0, 40)).toBe(false);
    }
  });

  it("payload bien firmado pero con tipos malos: inválido (se valida antes de usarlo)", () => {
    const { payload } = emitirToken(config, secreto);
    const malos = [
      { ...payload, n: "9" },
      { ...payload, id: "no-es-uuid" },
      { ...payload, pro: { pr: 1, mo: "" } },
      { ...payload, v: 2 },
      { ...payload, n: TOTAL_LLAMADAS + 1 },
      { ...payload, exp: payload.iat },
    ];
    for (const m of malos) {
      expect(verificarToken(firmarPayload(m as PayloadToken, secreto), secreto).ok).toBe(false);
    }
  });

  it("sin token: motivo 'falta'", () => {
    const r = verificarToken(undefined, secreto);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("falta");
  });

  it("caduca a los 30 minutos (reloj falso)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const { token } = emitirToken(config, secreto);
    vi.advanceTimersByTime(DURACION_TOKEN_MS - 1000);
    expect(verificarToken(token, secreto).ok).toBe(true);
    vi.advanceTimersByTime(1000);
    const r = verificarToken(token, secreto);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("expirado");
      expect(r.error).toBe(MENSAJE_TOKEN_EXPIRADO);
    }
  });

  it("un token emitido en el futuro (más allá de la holgura) no vale", () => {
    const { token } = emitirToken(config, secreto, Date.now() + 10 * 60 * 1000);
    expect(verificarToken(token, secreto).ok).toBe(false);
  });
});

describe("secreto", () => {
  it("sin secreto o con menos de 32 bytes: null fuera de development", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(obtenerSecreto({ NODE_ENV: "production" })).toBeNull();
    expect(obtenerSecreto({ NODE_ENV: "production", DEBATE_TOKEN_SECRET: "corto" })).toBeNull();
    expect(obtenerSecreto({ NODE_ENV: "production", DEBATE_TOKEN_SECRET: SECRETO_PRUEBA })).toEqual(secreto);
  });

  it("en development sin secreto: uno efímero, estable y con aviso", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = obtenerSecreto({ NODE_ENV: "development" });
    const b = obtenerSecreto({ NODE_ENV: "development" });
    expect(a && a.length >= 32).toBe(true);
    expect(a).toEqual(b);
    expect(aviso.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("RegistroTurnosMemoria", () => {
  it("un índice se marca una sola vez; liberar lo devuelve; caduca con el token", async () => {
    let ahora = 1_000;
    const r = new RegistroTurnosMemoria(() => ahora);
    expect(await r.marcar("d", 0, 5_000)).toBe(true);
    expect(await r.marcar("d", 0, 5_000)).toBe(false);
    expect(await r.marcar("d", 1, 5_000)).toBe(true);
    expect(await r.marcar("otro", 0, 5_000)).toBe(true);
    await r.liberar("d", 0);
    expect(await r.marcar("d", 0, 5_000)).toBe(true);
    ahora = 100_000;
    expect(await r.marcar("x", 0, 200_000)).toBe(true);
    expect(r.tamano).toBe(1);
  });
});

describe("POST /api/debate/start", () => {
  it("válido: 200 con un token verificable para 9 llamadas", async () => {
    const { status, texto } = await start({ ...config, pro: { ...config.pro, apiKey: "sk-no-debe-ir" } });
    expect(status).toBe(200);
    expect(texto).not.toContain("sk-no-debe-ir");
    expect(texto).not.toContain(TEMA);
    const json = JSON.parse(texto);
    expect(json.llamadas).toBe(TOTAL_LLAMADAS);
    const r = verificarToken(json.token, secreto);
    expect(r.ok).toBe(true);
    if (r.ok) expect(json.expira).toBe(r.payload.exp);
  });

  it("sin DEBATE_TOKEN_SECRET: 503 claro", async () => {
    vi.stubEnv("DEBATE_TOKEN_SECRET", "");
    const { status, texto } = await start(config);
    expect(status).toBe(503);
    expect(JSON.parse(texto).error).toBe(MENSAJE_SIN_SECRETO);
  });

  it("con un secreto de menos de 32 bytes: 503", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DEBATE_TOKEN_SECRET", "demasiado-corto");
    expect((await start(config)).status).toBe(503);
  });

  it("valida con las mismas reglas que los turnos, sin repetir lo enviado", async () => {
    const malos: [unknown, string?][] = [
      [{ ...config, topic: "" }],
      [{ ...config, topic: "x".repeat(201) }],
      [{ ...config, pro: { provider: "openrouter", model: "modelo-inventado-xyz" } }, "modelo-inventado-xyz"],
      [{ ...config, con: { provider: "proveedor-raro", model: "m" } }, "proveedor-raro"],
      [{ topic: TEMA, pro: config.pro }],
      ["[1,2]"],
      ["no es json"],
    ];
    for (const [cuerpo, secretoEco] of malos) {
      const { status, texto } = await start(cuerpo);
      expect(status).toBe(400);
      if (secretoEco) expect(texto).not.toContain(secretoEco);
    }
  });

  it("cuerpo enorme: 413", async () => {
    expect((await start({ ...config, relleno: "x".repeat(20_000) })).status).toBe(413);
  });

  it("las guardias corren antes de firmar y pueden cortar el inicio", async () => {
    const guardia = vi.fn(async () => ({ status: 429, error: "Hoy ya jugaste tus debates." }));
    GUARDIAS_INICIO.push(guardia);
    const { status, texto } = await start(config);
    expect(status).toBe(429);
    expect(JSON.parse(texto)).toEqual({ error: "Hoy ya jugaste tus debates." });
    expect(guardia).toHaveBeenCalledOnce();
  });
});
