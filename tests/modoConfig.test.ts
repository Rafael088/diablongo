import { describe, expect, it, vi } from "vitest";
import {
  esModo,
  estadoDeCupo,
  modoInicial,
  pedirCupo,
  proveedorDelModo,
  puedeIniciar,
  textoContador,
} from "@/lib/modoConfig";

describe("modoInicial", () => {
  it("sin nada guardado: gratis, o key si ya hay una key", () => {
    expect(modoInicial(null, false)).toBe("gratis");
    expect(modoInicial(null, true)).toBe("key");
  });
  it("respeta el modo guardado", () => {
    expect(modoInicial({ modo: "key" }, false)).toBe("key");
    expect(modoInicial({ modo: "gratis" }, true)).toBe("gratis");
  });
  it("openrouter guardado se respeta", () => {
    expect(modoInicial({ modo: "openrouter" }, true)).toBe("openrouter");
  });
  it("configs viejas: se deduce de los proveedores", () => {
    expect(modoInicial({ proProvider: "gratis", conProvider: "gratis" }, true)).toBe("gratis");
    expect(modoInicial({ proProvider: "gratis", conProvider: "groq" }, false)).toBe("key");
  });
  it("un modo desconocido se ignora", () => {
    expect(esModo("otro")).toBe(false);
    expect(modoInicial({ modo: "otro" }, false)).toBe("gratis");
  });
});

describe("proveedorDelModo", () => {
  it("gratis fuerza el proveedor gratis; key respeta lo elegido", () => {
    expect(proveedorDelModo("gratis", "groq")).toBe("gratis");
    expect(proveedorDelModo("key", "groq")).toBe("groq");
    expect(proveedorDelModo("openrouter", "groq")).toBe("openrouter");
  });
});

describe("puedeIniciar", () => {
  const base = { tema: "algo", verificado: true };
  it("pide tema y verificación", () => {
    expect(puedeIniciar({ ...base, modo: "key", tema: "  " })).toBe(false);
    expect(puedeIniciar({ ...base, modo: "key", verificado: false })).toBe(false);
    expect(puedeIniciar({ ...base, modo: "key" })).toBe(true);
  });
  it("openrouter no inicia hasta estar conectado", () => {
    expect(puedeIniciar({ ...base, modo: "openrouter" })).toBe(false);
    expect(puedeIniciar({ ...base, modo: "openrouter", conectadoOpenRouter: true })).toBe(true);
  });
  it("gratis con cupo agotado no inicia; si el contador falla, sí", () => {
    expect(puedeIniciar({ ...base, modo: "gratis", contador: { tipo: "agotado" } })).toBe(false);
    expect(puedeIniciar({ ...base, modo: "gratis", contador: { tipo: "error" } })).toBe(true);
    expect(puedeIniciar({ ...base, modo: "gratis", contador: { tipo: "quedan", quedan: 2 } })).toBe(true);
    expect(puedeIniciar({ ...base, modo: "key", contador: { tipo: "agotado" } })).toBe(true);
  });
});

describe("estadoDeCupo", () => {
  it("quedan > 0", () => {
    expect(estadoDeCupo(200, { quedan: 3, reinicia: "x" })).toEqual({ tipo: "quedan", quedan: 3, reinicia: "x" });
  });
  it("0 es agotado", () => {
    expect(estadoDeCupo(200, { quedan: 0 })).toEqual({ tipo: "agotado", reinicia: undefined });
  });
  it("negativos se tratan como agotado", () => {
    expect(estadoDeCupo(200, { quedan: -2 }).tipo).toBe("agotado");
  });
  it("503, 500 o cuerpo raro son error", () => {
    expect(estadoDeCupo(503, { error: "x" }).tipo).toBe("error");
    expect(estadoDeCupo(500, null).tipo).toBe("error");
    expect(estadoDeCupo(200, null).tipo).toBe("error");
    expect(estadoDeCupo(200, { quedan: "3" }).tipo).toBe("error");
    expect(estadoDeCupo(200, { quedan: NaN }).tipo).toBe("error");
  });
});

describe("pedirCupo", () => {
  const resp = (status: number, cuerpo: unknown) =>
    vi.fn().mockResolvedValue({ status, json: async () => cuerpo }) as unknown as typeof fetch;
  it("lee la respuesta", async () => {
    expect(await pedirCupo(resp(200, { quedan: 1 }))).toMatchObject({ tipo: "quedan", quedan: 1 });
  });
  it("si fetch lanza, devuelve error sin lanzar", async () => {
    const f = vi.fn().mockRejectedValue(new Error("red")) as unknown as typeof fetch;
    expect(await pedirCupo(f)).toEqual({ tipo: "error" });
  });
  it("si el cuerpo no es JSON, error", async () => {
    const f = vi.fn().mockResolvedValue({ status: 200, json: async () => { throw new Error("x"); } }) as unknown as typeof fetch;
    expect(await pedirCupo(f)).toEqual({ tipo: "error" });
  });
});

describe("textoContador", () => {
  it("singular, plural, agotado y error", () => {
    expect(textoContador({ tipo: "quedan", quedan: 1 })).toContain("1 debate");
    expect(textoContador({ tipo: "quedan", quedan: 3 })).toContain("3 debates");
    expect(textoContador({ tipo: "agotado" })).toContain("ya no te quedan");
    expect(textoContador({ tipo: "error" })).toContain("intentar igual");
  });
});
