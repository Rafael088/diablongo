import { describe, expect, it, vi } from "vitest";
import {
  CLAVE_VERIFIER,
  calcularChallenge,
  canjearCodigo,
  construirUrlAutorizacion,
  generarVerifier,
  iniciarConexion,
  procesarVuelta,
  urlDeVuelta,
} from "@/lib/oauthOpenRouter";

const resp = (status: number, cuerpo: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));

describe("PKCE", () => {
  it("challenge con el vector del RFC 7636", async () => {
    expect(await calcularChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });
  it("verifier: 43 caracteres base64url y distinto cada vez", () => {
    const a = generarVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generarVerifier()).not.toBe(a);
  });
  it("URL de autorización", () => {
    const u = new URL(construirUrlAutorizacion("https://x.dev/", "abc"));
    expect(u.origin + u.pathname).toBe("https://openrouter.ai/auth");
    expect(u.searchParams.get("callback_url")).toBe("https://x.dev/");
    expect(u.searchParams.get("code_challenge")).toBe("abc");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });
  it("urlDeVuelta quita query y hash", () => {
    expect(urlDeVuelta({ origin: "http://localhost:3000", pathname: "/" })).toBe("http://localhost:3000/");
  });
  it("iniciarConexion guarda el verifier y su challenge va en la URL", async () => {
    const guardado: Record<string, string> = {};
    const url = await iniciarConexion(
      { origin: "https://x.dev", pathname: "/" },
      { setItem: (k, v) => void (guardado[k] = v) }
    );
    const ch = new URL(url).searchParams.get("code_challenge");
    expect(ch).toBe(await calcularChallenge(guardado[CLAVE_VERIFIER]));
  });
});

describe("canjearCodigo", () => {
  it("éxito: manda code, verifier y S256, y devuelve la key", async () => {
    const f = resp(200, { key: "sk-or-usuario" });
    const r = await canjearCodigo("c1", "v1", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, key: "sk-or-usuario" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/auth/keys");
    expect(JSON.parse(init.body as string)).toEqual({ code: "c1", code_verifier: "v1", code_challenge_method: "S256" });
  });
  it("error HTTP: mensaje claro, sin el code", async () => {
    const r = await canjearCodigo("secreto", "v", resp(403, {}) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("403");
      expect(r.error).not.toContain("secreto");
    }
  });
  it("sin verifier no llama a la red", async () => {
    const f = resp(200, { key: "k" });
    const r = await canjearCodigo("c", null, f as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("respuesta sin key y fallo de red son errores, no excepciones", async () => {
    expect((await canjearCodigo("c", "v", resp(200, {}) as unknown as typeof fetch)).ok).toBe(false);
    const caida = vi.fn(async () => {
      throw new Error("red");
    });
    expect((await canjearCodigo("c", "v", caida as unknown as typeof fetch)).ok).toBe(false);
  });
});

describe("procesarVuelta", () => {
  const sesion = () => {
    const d: Record<string, string> = { [CLAVE_VERIFIER]: "ver" };
    return {
      getItem: (k: string) => d[k] ?? null,
      removeItem: (k: string) => void delete d[k],
      d,
    };
  };
  it("sin code no hace nada", () => {
    const limpiar = vi.fn();
    expect(procesarVuelta({ search: "?a=1", pathname: "/", hash: "" }, sesion(), limpiar)).toBeNull();
    expect(limpiar).not.toHaveBeenCalled();
  });
  it("canjea una sola vez aunque se llame dos veces, limpia URL y verifier", async () => {
    const s = sesion();
    const limpiar = vi.fn();
    const f = resp(200, { key: "K" }) as unknown as typeof fetch;
    const loc = { search: "?code=abc&x=1", pathname: "/", hash: "" };
    const p1 = procesarVuelta(loc, s, limpiar, f);
    const p2 = procesarVuelta(loc, s, limpiar, f);
    expect(await p1).toEqual({ ok: true, key: "K" });
    expect(await p2).toEqual({ ok: true, key: "K" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(limpiar).toHaveBeenCalledTimes(1);
    expect(limpiar).toHaveBeenLastCalledWith("/?x=1");
    expect(s.d[CLAVE_VERIFIER]).toBeUndefined();
  });
});
