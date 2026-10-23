// Página del reto /r/<id> y su voto (v0.4.0, cotejo-6tlml4): POST /api/retos/<id>/voto contra la
// migración de verdad (PGlite), con siteverify simulado; y lo que la página manda al navegador.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isValidElement, type ReactElement } from "react";
import { TOTAL_TURNS, TURN_PLAN } from "@/lib/debateEngine";
import { acreditarCompra, descontarDebate } from "@/lib/creditos";
import { crearReto, esVotante, leerReto, registrarFrase, type RetoPublico } from "@/lib/retos";
import { ACCION_TURNSTILE, ACCION_TURNSTILE_VOTO, MENSAJE_TURNSTILE_RECHAZADO, URL_SITEVERIFY } from "@/lib/turnstile";
import {
  COOKIE_VOTANTE,
  DESCRIPCION_RETO,
  MENSAJE_RETO_NO_EXISTE,
  MENSAJE_VOTO_NO_DISPONIBLE,
  desenlaceReto,
  mensajesDeTurnos,
  nombresReto,
  porcentajes,
  temaParaTitulo,
  textosMetadataReto,
  vistaReto,
} from "@/lib/vistaReto";
import { ALTO_OG, ANCHO_OG, imagenReto, tamanoTema } from "@/lib/imagenReto";
import { ANA, crearBaseDePrueba, type BaseDePrueba } from "./ayudaPg";

// connection() solo existe dentro de una petición real de Next; aquí la página se llama directo.
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0" }) }));
const cuentas = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ clienteAdmin: () => cuentas.admin }));
const eventos = vi.hoisted(() => ({ contar: vi.fn(async () => {}) }));
vi.mock("@/lib/eventosReto", () => ({ contarEventoReto: eventos.contar, esRastreador: () => false }));

import { POST as VOTAR } from "@/app/api/retos/[id]/voto/route";
import ContenidoReto from "@/app/r/[id]/contenido";
import { generateMetadata } from "@/app/r/[id]/page";

const TEMA = "¿Me compro los rines 17 o pago la tarjeta?";
const DEBATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "RetoPrueba";
const DESENLACE = "Rines puestos: el carro brilla y tu bolsillo llora.";
const TOKEN_TS = "token-turnstile-de-voto";

let base: BaseDePrueba;
let siteverify: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  base = await crearBaseDePrueba();
}, 30_000);
afterAll(async () => {
  await base?.pg.close();
});

/** Respuesta de siteverify para el próximo voto. */
function turnstile(respuesta: Record<string, unknown> = { success: true, action: ACCION_TURNSTILE_VOTO }) {
  siteverify = vi.fn(async () => new Response(JSON.stringify(respuesta), { status: 200 }));
  vi.stubGlobal("fetch", siteverify);
}

/** Reto de Ana con las 8 frases y el desenlace del Diablo (eligió "con"). */
async function retoGuardado(): Promise<RetoPublico> {
  await acreditarCompra(base.db, ANA, 5, "mp-1");
  await descontarDebate(base.db, ANA, 1, DEBATE);
  for (let i = 0; i <= TOTAL_TURNS; i++) {
    const rol = i < TOTAL_TURNS ? TURN_PLAN[i].nextSpeaker : "con";
    await registrarFrase(base.db, {
      usuario: ANA,
      debate: DEBATE,
      indice: i,
      rol,
      personalidad: rol === "pro" ? "angel-abuela" : "diablo-influencer",
      tema: TEMA,
      texto: i < TOTAL_TURNS ? `frase ${i}` : DESENLACE,
    });
  }
  const r = await crearReto(base.db, ANA, DEBATE, "con", () => ID);
  expect(r).toEqual({ ok: true, id: ID, creado: true });
  return (await leerReto(base.db, ID))!;
}

beforeEach(async () => {
  await base.reiniciar();
  cuentas.admin = base.db;
  eventos.contar.mockClear();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto-turnstile-de-prueba");
  turnstile();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function votar(cuerpo: unknown, opciones: { id?: string; cookie?: string } = {}) {
  const id = opciones.id ?? ID;
  const headers: Record<string, string> = { "x-forwarded-for": "7.7.7.7" };
  if (opciones.cookie) headers.cookie = `${COOKIE_VOTANTE}=${opciones.cookie}`;
  const res = await VOTAR(
    new NextRequest(`http://localhost/api/retos/${id}/voto`, {
      method: "POST",
      headers,
      body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    }),
    { params: Promise.resolve({ id }) }
  );
  const galleta = res.cookies.get(COOKIE_VOTANTE);
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, galleta, res };
}

const votosEnBase = async () => (await base.pg.query("select voto from public.votos_reto")).rows;

describe("POST /api/retos/<id>/voto: Turnstile", () => {
  it("token rechazado por Cloudflare: 403, sin voto y sin cookie", async () => {
    await retoGuardado();
    turnstile({ success: false, "error-codes": ["invalid-input-response"] });
    const r = await votar({ voto: "pro", turnstile: TOKEN_TS });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe(MENSAJE_TURNSTILE_RECHAZADO);
    expect(r.galleta).toBeUndefined();
    expect(await votosEnBase()).toHaveLength(0);
    expect(eventos.contar).not.toHaveBeenCalled();
  });

  it("un token del inicio de debate (otra acción) no sirve para votar", async () => {
    await retoGuardado();
    turnstile({ success: true, action: ACCION_TURNSTILE });
    expect((await votar({ voto: "pro", turnstile: TOKEN_TS })).status).toBe(403);
    expect(await votosEnBase()).toHaveLength(0);
  });

  it("sin token: 403 sin llamar a siteverify; sin secreto en producción: 503", async () => {
    await retoGuardado();
    expect((await votar({ voto: "pro" })).status).toBe(403);
    expect(siteverify).not.toHaveBeenCalled();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect((await votar({ voto: "pro", turnstile: TOKEN_TS })).status).toBe(503);
    expect(await votosEnBase()).toHaveLength(0);
  });

  it("manda el token, el secreto y la IP a siteverify", async () => {
    await retoGuardado();
    await votar({ voto: "pro", turnstile: TOKEN_TS });
    const [url, init] = siteverify.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_SITEVERIFY);
    const form = init.body as URLSearchParams;
    expect(form.get("response")).toBe(TOKEN_TS);
    expect(form.get("remoteip")).toBe("7.7.7.7");
  });
});

describe("POST /api/retos/<id>/voto: cookie y voto único", () => {
  it("sin cookie: crea una httpOnly de un año, registra el voto y entonces revela la elección y el desenlace", async () => {
    await retoGuardado();
    const r = await votar({ voto: "pro", turnstile: TOKEN_TS });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ registrado: true, voto: "pro", votos: { pro: 1, con: 0 }, eleccion: "con", desenlace: DESENLACE });
    expect(esVotante(r.galleta?.value)).toBe(true);
    expect(r.galleta).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    expect(r.res.headers.get("cache-control")).toBe("no-store");
    // En la base solo queda la huella, nunca el valor de la cookie.
    const filas = (await base.pg.query<{ votante: string }>("select votante from public.votos_reto")).rows;
    expect(filas).toHaveLength(1);
    expect(filas[0].votante).not.toBe(r.galleta!.value);
    expect(eventos.contar).toHaveBeenCalledWith("reto_votado", { retoId: ID, voto: "pro" });
  });

  it("en producción la cookie va con Secure", async () => {
    await retoGuardado();
    vi.stubEnv("NODE_ENV", "production");
    const r = await votar({ voto: "con", turnstile: TOKEN_TS });
    expect(r.status).toBe(200);
    expect(r.galleta?.secure).toBe(true);
  });

  it("con cookie válida: la reutiliza (no manda otra) y el voto cuenta para ese navegador", async () => {
    await retoGuardado();
    const mia = "navegador-de-prueba-0123456789";
    const r = await votar({ voto: "con", turnstile: TOKEN_TS }, { cookie: mia });
    expect(r.status).toBe(200);
    expect(r.json.registrado).toBe(true);
    expect(r.galleta).toBeUndefined();
    // Otro voto desde el mismo navegador: no cambia nada y devuelve el voto de antes.
    const otra = await votar({ voto: "pro", turnstile: TOKEN_TS }, { cookie: mia });
    expect(otra.json).toEqual({ registrado: false, voto: "con", votos: { pro: 0, con: 1 }, eleccion: "con", desenlace: DESENLACE });
    expect(await votosEnBase()).toEqual([{ voto: "con" }]);
    expect(eventos.contar).toHaveBeenCalledTimes(1);
  });

  it("cookie con forma inválida: se ignora y se crea una nueva", async () => {
    await retoGuardado();
    const r = await votar({ voto: "pro", turnstile: TOKEN_TS }, { cookie: "corta" });
    expect(r.status).toBe(200);
    expect(esVotante(r.galleta?.value)).toBe(true);
    expect(r.galleta?.value).not.toBe("corta");
  });

  it("dos navegadores distintos suman dos votos", async () => {
    await retoGuardado();
    const a = await votar({ voto: "pro", turnstile: TOKEN_TS });
    const b = await votar({ voto: "con", turnstile: TOKEN_TS });
    expect(a.galleta!.value).not.toBe(b.galleta!.value);
    expect(b.json.votos).toEqual({ pro: 1, con: 1 });
  });
});

describe("POST /api/retos/<id>/voto: rechazos", () => {
  it("reto inexistente: 404 amable y sin cookie", async () => {
    const r = await votar({ voto: "pro", turnstile: TOKEN_TS }, { id: "NoExiste12" });
    expect(r.status).toBe(404);
    expect(r.json.error).toBe(MENSAJE_RETO_NO_EXISTE);
    expect(r.galleta).toBeUndefined();
  });

  it("id con forma inválida: 404 sin llamar a siteverify ni a la base", async () => {
    cuentas.admin = { rpc: vi.fn() };
    const r = await votar({ voto: "pro", turnstile: TOKEN_TS }, { id: "../etc" });
    expect(r.status).toBe(404);
    expect(siteverify).not.toHaveBeenCalled();
    expect((cuentas.admin as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("cuerpo inválido, voto inválido o campos de más: 400", async () => {
    await retoGuardado();
    for (const cuerpo of ["no es json", { voto: "empate", turnstile: TOKEN_TS }, { voto: "pro", turnstile: TOKEN_TS, votos: 99 }, []]) {
      expect((await votar(cuerpo)).status).toBe(400);
    }
    expect(siteverify).not.toHaveBeenCalled();
    expect(await votosEnBase()).toHaveLength(0);
  });

  it("sin Supabase configurado: 503", async () => {
    cuentas.admin = null;
    const r = await votar({ voto: "pro", turnstile: TOKEN_TS });
    expect(r.status).toBe(503);
    expect(r.json.error).toBe(MENSAJE_VOTO_NO_DISPONIBLE);
  });

  it("la base falla: 503 sin detalles", async () => {
    cuentas.admin = { rpc: async () => ({ data: null, error: { message: "conexión caída en 10.0.0.1" } }) };
    const r = await votar({ voto: "pro", turnstile: TOKEN_TS });
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.json)).not.toContain("10.0.0.1");
  });
});

describe("página /r/<id>", () => {
  type PropsArena = { reto: Record<string, unknown> };

  it("al navegador solo le llegan tema, 8 turnos y personalidades: ni la elección ni el desenlace", async () => {
    await retoGuardado();
    const el = (await ContenidoReto({ params: Promise.resolve({ id: ID }) })) as ReactElement<PropsArena>;
    expect(isValidElement(el)).toBe(true);
    expect(el.props.reto).toEqual({
      id: ID,
      tema: TEMA,
      turnos: Array.from({ length: TOTAL_TURNS }, (_, i) => `frase ${i}`),
      personalidades: { pro: "angel-abuela", con: "diablo-influencer" },
    });
    const enviado = JSON.stringify(el.props);
    expect(enviado).not.toContain("eleccion");
    expect(enviado).not.toContain(DESENLACE);
    expect(eventos.contar).toHaveBeenCalledWith("reto_abierto", { retoId: ID });
  });

  it("reto inexistente o id inválido: notFound()", async () => {
    for (const id of ["NoExiste12", "x", "../../etc"]) {
      await expect(ContenidoReto({ params: Promise.resolve({ id }) })).rejects.toMatchObject({
        digest: expect.stringContaining("404"),
      });
    }
    expect(eventos.contar).not.toHaveBeenCalled();
  });

  it("sin base: aviso en la página, no un error", async () => {
    cuentas.admin = null;
    const el = (await ContenidoReto({ params: Promise.resolve({ id: ID }) })) as ReactElement<{ children: string }>;
    expect(el.props.children).toMatch(/no están disponibles/);
  });

  it("metadata: título con el dilema, descripción y Open Graph para compartir (sin la elección)", async () => {
    await retoGuardado();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://diablongo.example");
    const m = await generateMetadata({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) });
    expect(m.title).toBe(`«${TEMA}» · Reto de Diablongo`);
    expect(m.description).toBe(DESCRIPCION_RETO);
    expect(String(m.metadataBase)).toBe("https://diablongo.example/");
    expect(m.openGraph).toMatchObject({ title: m.title, description: DESCRIPCION_RETO, url: `/r/${ID}` });
    expect(m.robots).toMatchObject({ index: false });
    expect(JSON.stringify(m)).not.toContain(DESENLACE);
  });

  it("metadata de un reto inexistente: título amable y sin indexar", async () => {
    const m = await generateMetadata({ params: Promise.resolve({ id: "NoExiste12" }), searchParams: Promise.resolve({}) });
    expect(m.title).toBe("Reto no encontrado · Diablongo");
    expect(m.openGraph).toBeUndefined();
  });
});

describe("piezas puras de la página", () => {
  const reto: RetoPublico = {
    id: ID,
    tema: TEMA,
    frases: [
      { indice: 8, rol: "pro", texto: "final" },
      ...Array.from({ length: TOTAL_TURNS }, (_, i) => ({ indice: TOTAL_TURNS - 1 - i, rol: TURN_PLAN[TOTAL_TURNS - 1 - i].nextSpeaker, texto: `t${TOTAL_TURNS - 1 - i}` })),
    ],
    personalidades: { pro: "angel-coach", con: "inventada" },
    eleccion: "pro",
    creadoEn: "2026-10-23T00:00:00.000Z",
    votos: { pro: 2, con: 1 },
  };

  it("vistaReto ordena los turnos, quita el desenlace y cae a la clásica con una personalidad desconocida", () => {
    const v = vistaReto(reto);
    expect(v.turnos).toEqual(Array.from({ length: TOTAL_TURNS }, (_, i) => `t${i}`));
    expect(v.personalidades).toEqual({ pro: "angel-coach", con: "diablo-clasico" });
    expect(Object.keys(v).sort()).toEqual(["id", "personalidades", "tema", "turnos"]);
    expect(desenlaceReto(reto)).toBe("final");
    expect(desenlaceReto({ ...reto, frases: reto.frases.filter((f) => f.indice < 8) })).toBeNull();
    expect(nombresReto(v.personalidades)).toEqual({ pro: "Coach motivacional", con: "Diablo" });
  });

  it("mensajesDeTurnos sigue el plan del debate (para saltar a la votación)", () => {
    const m = mensajesDeTurnos(["a", "b", "c"]);
    expect(m.map((x) => [x.role, x.phase, x.content])).toEqual([
      ["pro", "opening", "a"],
      ["con", "opening", "b"],
      ["pro", "rebuttal", "c"],
    ]);
  });

  it("porcentajes enteros que suman 100", () => {
    expect(porcentajes({ pro: 0, con: 0 })).toEqual({ pro: 0, con: 0 });
    expect(porcentajes({ pro: 1, con: 2 })).toEqual({ pro: 33, con: 67 });
    expect(porcentajes({ pro: 5, con: 0 })).toEqual({ pro: 100, con: 0 });
  });

  it("títulos recortados y tamaño del dilema en la imagen", () => {
    const largo = "a".repeat(200);
    expect(temaParaTitulo(largo).length).toBe(70);
    expect(temaParaTitulo("  hola   mundo ")).toBe("hola mundo");
    expect(textosMetadataReto({ tema: TEMA }).titulo).toContain(TEMA);
    expect(tamanoTema("corto")).toBeGreaterThan(tamanoTema(largo));
  });

  it("la imagen de Open Graph es un PNG de 1200×630 (también sin reto)", async () => {
    vi.unstubAllGlobals(); // next/og carga su WASM con fetch: el de verdad, no el siteverify simulado
    const { ImageResponse } = await import("next/og");
    for (const r of [reto, null]) {
      const res = new ImageResponse(imagenReto(r), { width: ANCHO_OG, height: ALTO_OG });
      const png = Buffer.from(await res.arrayBuffer());
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(ANCHO_OG);
      expect(png.readUInt32BE(20)).toBe(ALTO_OG);
    }
  }, 30_000);

  it("la imagen no lleva la elección de quien retó", () => {
    expect(JSON.stringify(imagenReto(reto))).not.toMatch(/eleccion|Ganó|hizo caso/);
  });
});
