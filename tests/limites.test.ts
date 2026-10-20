// Pruebas del límite diario del modo gratis, el cupo global y el registro de turnos en Redis (almacén simulado).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as START } from "@/app/api/debate/start/route";
import { GET as CUPO } from "@/app/api/debate/cupo/route";
import { AlmacenMemoria, usarAlmacen } from "@/lib/almacen";
import { MENSAJE_CUPO_GLOBAL, MENSAJE_LIMITE_IP, CUPO_GLOBAL_POR_DEFECTO, fechaBogota, reinicioBogota } from "@/lib/limites";
import { RegistroTurnosUpstash } from "@/lib/registroTurnos";
import { providers } from "@/lib/providers";
import { SECRETO_PRUEBA } from "./ayudaToken";

let almacen: AlmacenMemoria;

beforeEach(() => {
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
  vi.stubEnv("OPENROUTER_API_KEY", "sk-x");
  almacen = new AlmacenMemoria();
  usarAlmacen(almacen);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  usarAlmacen(undefined);
});

const gratis = { provider: "gratis", model: "" };
const conKey = { provider: "openrouter", model: providers.find((p) => p.id === "openrouter")!.models[0] };

function start(ip: string | null, modo = gratis) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ip) headers["x-forwarded-for"] = `${ip}, 10.0.0.1`;
  return START(
    new NextRequest("http://localhost/api/debate/start", {
      method: "POST",
      headers,
      body: JSON.stringify({ topic: "¿Gatos o perros?", pro: modo, con: modo }),
    })
  );
}
function cupo(ip: string) {
  return CUPO(new NextRequest("http://localhost/api/debate/cupo", { headers: { "x-forwarded-for": ip } }));
}

describe("límite por IP", () => {
  it("3 debates pasan (con quedan decreciente) y el 4º da 429 con el mensaje de IP", async () => {
    for (const quedan of [2, 1, 0]) {
      const r = await start("1.1.1.1");
      expect(r.status).toBe(200);
      const d = await r.json();
      expect(d.quedan).toBe(quedan);
      expect(typeof d.token).toBe("string");
    }
    const r = await start("1.1.1.1");
    expect(r.status).toBe(429);
    const d = await r.json();
    expect(d.error).toBe(MENSAJE_LIMITE_IP);
    expect(d.quedan).toBe(0);
    expect(d.reinicia).toMatch(/T00:00:00-05:00$/);
    expect(d.token).toBeUndefined();
  });

  it("otra IP sigue pudiendo", async () => {
    for (let i = 0; i < 4; i++) await start("1.1.1.1");
    expect((await start("2.2.2.2")).status).toBe(200);
  });

  it("sin cabeceras de IP cuenta como una sola IP «desconocida»", async () => {
    for (let i = 0; i < 3; i++) expect((await start(null)).status).toBe(200);
    expect((await start(null)).status).toBe(429);
  });

  it("LIMITE_IP_DIARIO cambia el tope", async () => {
    vi.stubEnv("LIMITE_IP_DIARIO", "1");
    expect((await start("1.1.1.1")).status).toBe(200);
    expect((await start("1.1.1.1")).status).toBe(429);
  });

  it("la IP no aparece en claro en ninguna clave", async () => {
    await start("203.0.113.77");
    expect(almacen.claves().length).toBe(2);
    for (const k of almacen.claves()) {
      expect(k).not.toContain("203.0.113.77");
      expect(k).not.toContain("203");
    }
  });

  it("las claves llevan la fecha local y caducan (48 h)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00-05:00"));
    await start("1.1.1.1");
    expect(almacen.claves().every((k) => k.includes("2026-10-19"))).toBe(true);
    vi.setSystemTime(new Date("2026-10-21T12:00:01-05:00"));
    expect(almacen.claves()).toEqual([]);
  });
});

describe("cupo global", () => {
  it("por defecto es floor(1000 / 9) = 111", () => {
    expect(CUPO_GLOBAL_POR_DEFECTO).toBe(111);
  });

  it("agota a todos con su mensaje", async () => {
    vi.stubEnv("CUPO_GLOBAL_DIARIO", "2");
    expect((await start("1.1.1.1")).status).toBe(200);
    expect((await start("2.2.2.2")).status).toBe(200);
    const r = await start("3.3.3.3");
    expect(r.status).toBe(429);
    const d = await r.json();
    expect(d.error).toBe(MENSAJE_CUPO_GLOBAL);
    expect(d.quedan).toBe(0);
    expect(d.reinicia).toBeTruthy();
    expect((await start("1.1.1.1")).status).toBe(429);
  });

  it("un debate rechazado no consume cupo", async () => {
    vi.stubEnv("CUPO_GLOBAL_DIARIO", "5");
    for (let i = 0; i < 3; i++) await start("1.1.1.1");
    for (let i = 0; i < 4; i++) expect((await start("1.1.1.1")).status).toBe(429);
    const d = await (await cupo("9.9.9.9")).json();
    expect(d.quedan).toBe(2); // gastó 3 de 5; los 4 rechazos no cuentan
    expect((await start("2.2.2.2")).status).toBe(200);
    expect((await start("2.2.2.2")).status).toBe(200);
    expect((await start("2.2.2.2")).status).toBe(429);
  });

  it("una validación fallida o un rechazo previo no consume", async () => {
    const r = await START(
      new NextRequest("http://localhost/api/debate/start", { method: "POST", body: JSON.stringify({ topic: "" }) })
    );
    expect(r.status).toBe(400);
    expect(almacen.claves()).toEqual([]);
  });
});

describe("cambio de día", () => {
  it("reinicia a medianoche de Bogotá", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T23:59:30-05:00"));
    for (let i = 0; i < 3; i++) await start("1.1.1.1");
    expect((await start("1.1.1.1")).status).toBe(429);
    vi.setSystemTime(new Date("2026-10-20T00:00:30-05:00"));
    const r = await start("1.1.1.1");
    expect(r.status).toBe(200);
    expect((await r.json()).quedan).toBe(2);
  });

  it("fecha y reinicio se calculan en hora de Bogotá, no UTC", () => {
    const t = Date.parse("2026-10-19T23:30:00-05:00"); // ya es 20 en UTC
    expect(fechaBogota(t)).toBe("2026-10-19");
    expect(reinicioBogota(t)).toBe("2026-10-20T00:00:00-05:00");
  });
});

describe("modos con key del usuario", () => {
  it("no cuentan ni devuelven quedan", async () => {
    for (let i = 0; i < 6; i++) {
      const r = await start("1.1.1.1", conKey);
      expect(r.status).toBe(200);
      expect((await r.json()).quedan).toBeUndefined();
    }
    expect(almacen.claves()).toEqual([]);
  });
});

describe("sin credenciales en producción", () => {
  beforeEach(() => {
    usarAlmacen(undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  it("el modo gratis responde 503 y el de key de usuario sigue", async () => {
    const g = await start("1.1.1.1");
    expect(g.status).toBe(503);
    expect((await g.json()).error).toBe("El modo gratis no está disponible ahora.");
    expect((await start("1.1.1.1", conKey)).status).toBe(200);
  });
});

describe("GET /api/debate/cupo", () => {
  it("devuelve quedan y reinicia sin consumir", async () => {
    for (let i = 0; i < 3; i++) {
      const d = await (await cupo("1.1.1.1")).json();
      expect(d.quedan).toBe(3);
      expect(d.reinicia).toMatch(/T00:00:00-05:00$/);
    }
    expect(almacen.claves()).toEqual([]);
    await start("1.1.1.1");
    expect((await (await cupo("1.1.1.1")).json()).quedan).toBe(2);
    expect((await (await cupo("1.1.1.1")).json()).quedan).toBe(2);
  });
});

describe("RegistroTurnosUpstash", () => {
  it("índice repetido da false y liberar permite reintentar", async () => {
    const reg = new RegistroTurnosUpstash(almacen);
    const exp = Date.now() + 60_000;
    expect(await reg.marcar("d1", 0, exp)).toBe(true);
    expect(await reg.marcar("d1", 0, exp)).toBe(false);
    expect(await reg.marcar("d1", 1, exp)).toBe(true);
    await reg.liberar("d1", 0);
    expect(await reg.marcar("d1", 0, exp)).toBe(true);
    expect(almacen.claves()).toContain("debate:d1:0");
  });

  it("la marca caduca con el token", async () => {
    vi.useFakeTimers();
    const reg = new RegistroTurnosUpstash(almacen);
    expect(await reg.marcar("d2", 0, Date.now() + 1000)).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(await reg.marcar("d2", 0, Date.now() + 1000)).toBe(true);
  });
});
