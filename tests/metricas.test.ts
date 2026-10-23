// Métricas sin datos personales (cotejo-o7aqeg): clave por día/zona, errores que no rompen, persona única
// sin IP en claro, acceso a /metricas y cada enganche contando lo que debe. Todo con almacén simulado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));
const sim = vi.hoisted(() => ({
  agente: "Mozilla/5.0",
  carga: { estado: "ok", reto: { id: "RetoPrueba" } } as unknown,
  creado: true,
  usuario: "u-1" as string | null,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": sim.agente }) }));
vi.mock("@/lib/cargarReto", () => ({ cargarReto: async () => sim.carga }));
vi.mock("@/lib/vistaReto", async (o) => ({ ...(await o<typeof import("@/lib/vistaReto")>()), vistaReto: () => ({}) }));
vi.mock("@/components/RetoArena", () => ({ default: () => null }));
vi.mock("@/lib/supabase/servidor", () => ({
  clienteServidor: async () => ({ auth: { getUser: async () => ({ data: { user: sim.usuario ? { id: sim.usuario } : null }, error: null }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ clienteAdmin: () => ({}) }));
vi.mock("@/lib/retos", async (o) => ({
  ...(await o<typeof import("@/lib/retos")>()),
  crearReto: async () => ({ ok: true, id: "RetoPrueba", creado: sim.creado }),
}));
vi.mock("@/lib/creditos", () => ({ descontarDebate: async () => ({ ok: true, saldo: 4 }) }));

import { AlmacenMemoria, usarAlmacen, type Almacen } from "@/lib/almacen";
import { contar, contarLimiteGratis, claveMetrica, leerMetricas } from "@/lib/metricas";
import { contarEventoReto, esRastreador } from "@/lib/eventosReto";
import { revisarAcceso } from "@/lib/accesoMetricas";
import { guardiaCreditos } from "@/lib/guardiasInicio";
import { POST as START } from "@/app/api/debate/start/route";
import { POST as CREAR } from "@/app/api/retos/route";
import { GET as METRICAS } from "@/app/metricas/route";
import ContenidoReto from "@/app/r/[id]/contenido";
import { SECRETO_PRUEBA, TURNSTILE_PRUEBA, simularTurnstile } from "./ayudaToken";

let almacen: AlmacenMemoria;
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(Date.now());
const n = (c: Parameters<typeof claveMetrica>[0]) => almacen.get(claveMetrica(c, hoy()));

beforeEach(() => {
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
  vi.stubEnv("OPENROUTER_API_KEY", "sk-x");
  simularTurnstile();
  almacen = new AlmacenMemoria();
  usarAlmacen(almacen);
  sim.agente = "Mozilla/5.0";
  sim.carga = { estado: "ok", reto: { id: "RetoPrueba" } };
  sim.creado = true;
  sim.usuario = "u-1";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  usarAlmacen(undefined);
});

describe("contar", () => {
  it("la clave es metricas:<día de Bogotá>:<evento> y suma de a uno", async () => {
    await contar("reto_creado", almacen, Date.UTC(2026, 9, 23, 12));
    await contar("reto_creado", almacen, Date.UTC(2026, 9, 23, 12));
    expect(almacen.claves()).toEqual(["metricas:2026-10-23:reto_creado"]);
    expect(await almacen.get("metricas:2026-10-23:reto_creado")).toBe(2);
  });

  it("usa el día de Colombia: las 03:00 UTC aún son el día anterior; las 05:00 UTC ya son el nuevo", async () => {
    await contar("reto_abierto", almacen, Date.UTC(2026, 9, 24, 3));
    await contar("reto_abierto", almacen, Date.UTC(2026, 9, 24, 5));
    expect(almacen.claves().sort()).toEqual(["metricas:2026-10-23:reto_abierto", "metricas:2026-10-24:reto_abierto"]);
  });

  it("caduca a los 120 días", async () => {
    const t0 = Date.UTC(2026, 9, 23, 12);
    let ahora = t0;
    const a = new AlmacenMemoria(() => ahora);
    await contar("reto_votado", a, t0);
    ahora = t0 + 119 * 86_400_000;
    expect(a.claves()).toHaveLength(1);
    ahora = t0 + 121 * 86_400_000;
    expect(a.claves()).toHaveLength(0);
  });

  it("un error de Upstash no lanza, se registra, y sin almacén tampoco hace nada", async () => {
    const roto = { incr: async () => { throw new Error("upstash caído"); } } as unknown as Almacen;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(contar("reto_creado", roto)).resolves.toBeUndefined();
    await expect(contarLimiteGratis("1.1.1.1", roto, Date.now(), Buffer.from("x"))).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    await expect(contar("reto_creado", null)).resolves.toBeUndefined();
    log.mockRestore();
  });
});

describe("persona única sin IP en claro", () => {
  it("la misma IP varias veces = 1 persona, 3 rechazos; otra IP suma otra persona", async () => {
    const secreto = Buffer.from(SECRETO_PRUEBA);
    const t = Date.UTC(2026, 9, 23, 12);
    for (let i = 0; i < 3; i++) await contarLimiteGratis("203.0.113.9", almacen, t, secreto);
    await contarLimiteGratis("198.51.100.4", almacen, t, secreto);
    const [fila] = await leerMetricas(almacen, 1, t);
    expect(fila.valores.limite_gratis).toBe(4);
    expect(fila.valores.limite_gratis_personas).toBe(2);
  });

  it("ni la IP ni su hash aparecen en claves o valores; al día siguiente la misma IP cuenta de nuevo", async () => {
    const secreto = Buffer.from(SECRETO_PRUEBA);
    const t = Date.UTC(2026, 9, 23, 12);
    await contarLimiteGratis("203.0.113.9", almacen, t, secreto);
    await contarLimiteGratis("203.0.113.9", almacen, t + 86_400_000, secreto);
    expect(almacen.claves().join("|")).not.toContain("203.0.113.9");
    const filas = await leerMetricas(almacen, 2, t + 86_400_000);
    expect(filas.map((f) => f.valores.limite_gratis_personas)).toEqual([1, 1]);
  });

  it("sin secreto cuenta el rechazo pero no anota a nadie", async () => {
    await contarLimiteGratis("203.0.113.9", almacen, Date.now(), null);
    expect(await n("limite_gratis")).toBe(1);
    expect(await almacen.pfcount(claveMetrica("limite_gratis_personas", hoy()))).toBe(0);
  });
});

describe("enganches", () => {
  const start = (ip: string) =>
    START(
      new NextRequest("http://localhost/api/debate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ turnstile: TURNSTILE_PRUEBA, topic: "¿Gatos o perros?", pro: { provider: "gratis", model: "" }, con: { provider: "gratis", model: "" } }),
      })
    );

  it("limite_gratis: solo cuenta el 4º intento (el rechazado), una persona", async () => {
    for (let i = 0; i < 3; i++) expect((await start("1.1.1.1")).status).toBe(200);
    expect(await n("limite_gratis")).toBeNull();
    expect((await start("1.1.1.1")).status).toBe(429);
    expect((await start("1.1.1.1")).status).toBe(429);
    expect(await n("limite_gratis")).toBe(2);
    expect(await almacen.pfcount(claveMetrica("limite_gratis_personas", hoy()))).toBe(1);
  });

  it("debate_creditos: cuenta uno por cobro correcto y nada si no hay sesión", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-x");
    vi.stubEnv("SUPABASE_SECRET_KEY", "x");
    const ctx = {
      request: new NextRequest("http://localhost/api/debate/start"),
      config: { pro: { provider: "creditos", model: "" }, con: { provider: "creditos", model: "" }, topic: "x" },
      cuerpo: {},
      debateId: "d-1",
    } as unknown as Parameters<typeof guardiaCreditos>[0];
    // clienteAdmin() está simulado como {} (con valor): el cobro simulado responde ok.
    expect(await guardiaCreditos(ctx)).toBeNull();
    expect(await n("debate_creditos")).toBe(1);
    sim.usuario = null;
    expect((await guardiaCreditos(ctx))?.status).toBe(401);
    expect(await n("debate_creditos")).toBe(1);
  });

  const crear = () =>
    CREAR(
      new NextRequest("http://localhost/api/retos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debate: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", eleccion: "pro" }),
      })
    );

  it("reto_creado: cuenta el 201 y no el 200 (ya existía)", async () => {
    expect((await crear()).status).toBe(201);
    sim.creado = false;
    expect((await crear()).status).toBe(200);
    expect(await n("reto_creado")).toBe(1);
  });

  it("reto_abierto: cuenta personas, no bots de vista previa ni retos inexistentes", async () => {
    await ContenidoReto({ params: Promise.resolve({ id: "RetoPrueba" }) });
    expect(await n("reto_abierto")).toBe(1);
    sim.agente = "WhatsApp/2.23.20 A";
    await ContenidoReto({ params: Promise.resolve({ id: "RetoPrueba" }) });
    sim.agente = "facebookexternalhit/1.1";
    await ContenidoReto({ params: Promise.resolve({ id: "RetoPrueba" }) });
    sim.carga = { estado: "no_existe" };
    await ContenidoReto({ params: Promise.resolve({ id: "x" }) }).catch(() => {});
    expect(await n("reto_abierto")).toBe(1);
  });

  it("reto_votado: contarEventoReto suma sin guardar id ni voto", async () => {
    await contarEventoReto("reto_votado", { retoId: "RetoSecreto", voto: "pro" });
    expect(await n("reto_votado")).toBe(1);
    expect(almacen.claves().join("|")).not.toMatch(/RetoSecreto|pro$/);
  });

  it("esRastreador reconoce los bots típicos y deja pasar navegadores", () => {
    for (const ua of ["WhatsApp/2.2", "facebookexternalhit/1.1", "Twitterbot/1.0", "TelegramBot (like TwitterBot)", "Mozilla/5.0 (compatible; Discordbot/2.0)", "Slackbot-LinkExpanding 1.0"]) {
      expect(esRastreador(ua)).toBe(true);
    }
    expect(esRastreador("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36")).toBe(false);
    expect(esRastreador(null)).toBe(false);
  });
});

describe("página /metricas", () => {
  const basic = (clave: string, usuario = "yo") => `Basic ${Buffer.from(`${usuario}:${clave}`).toString("base64")}`;
  const pedir = (auth?: string) =>
    METRICAS(new NextRequest("http://localhost/metricas", { headers: auth ? { authorization: auth } : {} }));

  it("sin METRICAS_CLAVE configurada responde 404 aunque manden credenciales", async () => {
    expect((await pedir()).status).toBe(404);
    expect((await pedir(basic("lo-que-sea"))).status).toBe(404);
  });

  it("con clave configurada: sin credenciales 401 con WWW-Authenticate, clave mala 401, clave buena 200", async () => {
    vi.stubEnv("METRICAS_CLAVE", "clave-larga-de-prueba");
    const sin = await pedir();
    expect(sin.status).toBe(401);
    expect(sin.headers.get("www-authenticate")).toMatch(/^Basic/);
    expect((await pedir(basic("mala"))).status).toBe(401);
    expect((await pedir("Bearer clave-larga-de-prueba")).status).toBe(401);
    await contar("reto_creado");
    const ok = await pedir(basic("clave-larga-de-prueba", "cualquiera"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-robots-tag")).toContain("noindex");
    const html = await ok.text();
    expect(html).toContain('content="noindex');
    expect(html).toContain(hoy());
    expect(html).toContain("Retos creados");
  });

  it("revisarAcceso acepta contraseñas con «:»", () => {
    expect(revisarAcceso(basic("a:b"), { METRICAS_CLAVE: "a:b" } as unknown as NodeJS.ProcessEnv)).toBe("ok");
  });
});
