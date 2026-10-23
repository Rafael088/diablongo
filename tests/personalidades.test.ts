// Personalidades (v0.4.0): catálogo, prompts con las reglas de seguridad fuera de la personalidad,
// validación en /api/debate/start (solo con créditos) y personalidad tomada del token en /api/debate.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as START } from "@/app/api/debate/start/route";
import { POST as TURNO } from "@/app/api/debate/route";
import { GUARDIAS_INICIO } from "@/lib/guardiasInicio";
import { TURN_PLAN } from "@/lib/debateEngine";
import { PROVEEDOR_CREDITOS } from "@/lib/creditosDebate";
import { PROVEEDOR_GRATIS } from "@/lib/gratis";
import { providers } from "@/lib/providers";
import { RegistroTurnosMemoria, usarRegistroTurnos } from "@/lib/registroTurnos";
import { PROMPT_REVISOR } from "@/lib/revisarFrase";
import { REGLAS_SEGURIDAD, buildSystemPrompt } from "@/lib/prompts";
import {
  MENSAJE_PERSONALIDAD_DESCONOCIDA,
  MENSAJE_PERSONALIDAD_SOLO_CREDITOS,
  PERSONALIDAD_CLASICA,
  PERSONALIDADES,
  TODAS_LAS_PERSONALIDADES,
  personalidadDe,
  validarPersonalidad,
} from "@/lib/personalidades";
import { emitirToken, firmarPayload, validarInicio, verificarToken, type PayloadToken } from "@/lib/tokenDebate";
import { SECRETO_PRUEBA } from "./ayudaToken";

const secreto = Buffer.from(SECRETO_PRUEBA);
const TEMA = "¿Me compro los tenis caros?";
const CUENTA = "11111111-2222-4333-8444-555555555555";
const ROLES = ["pro", "con"] as const;
const modeloOR = providers.find((p) => p.id === "openrouter")!.models[0];

const creditos = (personalidad?: string) => ({ provider: PROVEEDOR_CREDITOS, model: "", personalidad });

describe("catálogo", () => {
  it("5 Ángeles y 5 Diablos, la clásica primero, ids únicos en todo el catálogo", () => {
    for (const rol of ROLES) {
      expect(PERSONALIDADES[rol]).toHaveLength(5);
      expect(PERSONALIDADES[rol][0].id).toBe(PERSONALIDAD_CLASICA[rol]);
      for (const p of PERSONALIDADES[rol]) expect(p.rol).toBe(rol);
    }
    const ids = TODAS_LAS_PERSONALIDADES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "angel-clasico",
      "angel-abuela",
      "angel-coach",
      "angel-abogado",
      "angel-filosofo",
      "diablo-clasico",
      "diablo-ex-toxico",
      "diablo-cripto",
      "diablo-narco",
      "diablo-influencer",
    ]);
  });

  it("cada personalidad tiene id estable, nombre, descripción y prompt de solo estilo", () => {
    for (const p of TODAS_LAS_PERSONALIDADES) {
      expect(p.id).toMatch(/^(angel|diablo)-[a-z-]+$/);
      expect(p.nombre.trim()).not.toBe("");
      expect(p.descripcion.trim()).not.toBe("");
      expect(p.prompt.startsWith("Tu personalidad:")).toBe(true);
      // La personalidad no trae reglas propias ni intenta pisar las de seguridad.
      expect(p.prompt).not.toMatch(/REGLAS|ignora|olvida|sin l[ií]mites|no hay reglas/i);
    }
  });

  it("un id del otro rol o inventado no es del catálogo", () => {
    expect(personalidadDe("con", "angel-abuela")).toBeUndefined();
    expect(personalidadDe("pro", "diablo-narco")).toBeUndefined();
    expect(personalidadDe("pro", "angel-inventado")).toBeUndefined();
    expect(personalidadDe("pro", 7)).toBeUndefined();
  });
});

describe("system prompt: la personalidad cambia el tono, no las reglas", () => {
  it.each(TODAS_LAS_PERSONALIDADES.map((p) => [p.id, p] as const))("%s", (_id, p) => {
    const prompt = buildSystemPrompt(p.rol, p.id);
    expect(prompt.startsWith(REGLAS_SEGURIDAD)).toBe(true);
    expect(prompt).toContain(p.prompt);
    // Las reglas de formato y (en el Diablo) el freno van DESPUÉS de la personalidad.
    const tras = prompt.slice(prompt.indexOf(p.prompt) + p.prompt.length);
    expect(tras).toContain("Reglas de formato (obligatorias)");
    if (p.rol === "con") {
      expect(tras).toContain("FRENO DEL DIABLO");
      expect(tras).toContain("aplica las reglas de seguridad del principio");
    }
    // Ningún otro texto de personalidad se cuela.
    for (const otra of TODAS_LAS_PERSONALIDADES) if (otra.id !== p.id) expect(prompt).not.toContain(otra.prompt);
  });

  it("sin personalidad o con un id que no es del rol, la clásica", () => {
    for (const rol of ROLES) {
      const clasica = buildSystemPrompt(rol, PERSONALIDAD_CLASICA[rol]);
      expect(buildSystemPrompt(rol)).toBe(clasica);
      expect(buildSystemPrompt(rol, "texto libre del cliente")).toBe(clasica);
    }
    expect(buildSystemPrompt("con", "angel-abuela")).toBe(buildSystemPrompt("con"));
  });
});

describe("validación de la personalidad", () => {
  it("falta = clásica, en cualquier modo", () => {
    for (const rol of ROLES) {
      for (const valor of [undefined, null, ""]) {
        expect(validarPersonalidad(rol, valor, false)).toEqual({ ok: true, id: PERSONALIDAD_CLASICA[rol] });
      }
    }
  });

  it("no clásica solo con créditos; fuera del catálogo nunca", () => {
    expect(validarPersonalidad("con", "diablo-cripto", true)).toEqual({ ok: true, id: "diablo-cripto" });
    expect(validarPersonalidad("con", "diablo-cripto", false)).toEqual({ ok: false, error: MENSAJE_PERSONALIDAD_SOLO_CREDITOS });
    expect(validarPersonalidad("pro", "angel-clasico", false)).toEqual({ ok: true, id: "angel-clasico" });
    expect(validarPersonalidad("pro", "diablo-narco", true)).toEqual({ ok: false, error: MENSAJE_PERSONALIDAD_DESCONOCIDA });
    expect(validarPersonalidad("pro", { id: "angel-abuela" }, true).ok).toBe(false);
  });

  it("validarInicio: con créditos acepta y devuelve las personalidades", () => {
    const r = validarInicio({ topic: TEMA, pro: creditos("angel-abuela"), con: creditos("diablo-narco") });
    expect(r).toMatchObject({ ok: true, config: { pro: { personalidad: "angel-abuela" }, con: { personalidad: "diablo-narco" } } });
  });

  it("validarInicio: en gratis, con key o con OpenRouter solo la clásica", () => {
    const gratis = { provider: PROVEEDOR_GRATIS, model: "" };
    const conKey = { provider: "openrouter", model: modeloOR };
    for (const otro of [gratis, conKey]) {
      expect(validarInicio({ topic: TEMA, pro: otro, con: { ...otro, personalidad: "diablo-influencer" } })).toEqual({
        ok: false,
        error: MENSAJE_PERSONALIDAD_SOLO_CREDITOS,
      });
      expect(validarInicio({ topic: TEMA, pro: { ...otro, personalidad: "angel-coach" }, con: otro }).ok).toBe(false);
      const ok = validarInicio({ topic: TEMA, pro: { ...otro, personalidad: "angel-clasico" }, con: otro });
      expect(ok).toMatchObject({ ok: true, config: { pro: { personalidad: "angel-clasico" }, con: { personalidad: "diablo-clasico" } } });
    }
  });

  it("validarInicio: id inventado o del otro personaje, 400 sin repetirlo", () => {
    for (const cuerpo of [
      { topic: TEMA, pro: creditos("angel-pirata"), con: creditos() },
      { topic: TEMA, pro: creditos(), con: creditos("angel-abuela") },
    ]) {
      const r = validarInicio(cuerpo);
      expect(r).toEqual({ ok: false, error: MENSAJE_PERSONALIDAD_DESCONOCIDA });
    }
  });
});

describe("token del debate", () => {
  it("la personalidad va firmada en el token (y la clásica si no se pidió)", () => {
    const { token } = emitirToken({ topic: TEMA, pro: creditos("angel-filosofo"), con: creditos("diablo-ex-toxico") }, secreto);
    const v = verificarToken(token, secreto);
    expect(v.ok && v.payload.pro.pe).toBe("angel-filosofo");
    expect(v.ok && v.payload.con.pe).toBe("diablo-ex-toxico");

    const gratis = emitirToken({ topic: TEMA, pro: { provider: PROVEEDOR_GRATIS, model: "" }, con: { provider: PROVEEDOR_GRATIS, model: "" } }, secreto);
    expect(gratis.payload.pro.pe).toBe("angel-clasico");
    expect(gratis.payload.con.pe).toBe("diablo-clasico");
  });

  it("cambiar la personalidad dentro del token rompe la firma", () => {
    const { token } = emitirToken({ topic: TEMA, pro: creditos(), con: creditos() }, secreto);
    const [parte, firma] = token.split(".");
    const payload = JSON.parse(Buffer.from(parte, "base64url").toString("utf8")) as PayloadToken;
    payload.con.pe = "diablo-narco";
    const manipulado = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${firma}`;
    expect(verificarToken(manipulado, secreto).ok).toBe(false);
  });

  it("un token firmado con una personalidad del otro rol o inventada no es válido", () => {
    const { payload } = emitirToken({ topic: TEMA, pro: creditos(), con: creditos() }, secreto);
    for (const pe of ["angel-abuela", "diablo-pirata"]) {
      const raro = { ...payload, con: { ...payload.con, pe } };
      expect(verificarToken(firmarPayload(raro, secreto), secreto).ok).toBe(false);
    }
  });
});

// ------------------------------------------------------------------ rutas (red simulada)

let systems: { modelo: string; system: string }[];
let revisiones: number;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-del-servidor");
  // Sin guardias (Turnstile, tema crítico, cupo, cobro): aquí solo se prueba la personalidad.
  GUARDIAS_INICIO.length = 0;
  usarRegistroTurnos(new RegistroTurnosMemoria());
  systems = [];
  revisiones = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const cuerpo = JSON.parse(String(init?.body)) as { model: string; messages: { role: string; content: string }[] };
      const system = cuerpo.messages[0].content;
      if (system === PROMPT_REVISOR) {
        revisiones++;
        return new Response(JSON.stringify({ choices: [{ message: { content: "SEGURA" } }] }), { status: 200 });
      }
      systems.push({ modelo: cuerpo.model, system });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Frase del personaje." } }] }), { status: 200 });
    })
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function start(cuerpo: Record<string, unknown>) {
  const res = await START(new NextRequest("http://localhost/api/debate/start", { method: "POST", body: JSON.stringify({ topic: TEMA, ...cuerpo }) }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function turno(token: string, indice: number, extra: Record<string, unknown> = {}, provider = PROVEEDOR_CREDITOS) {
  const plan = TURN_PLAN[indice];
  const res = await TURNO(
    new NextRequest("http://localhost/api/debate", {
      method: "POST",
      body: JSON.stringify({
        token,
        indice,
        topic: TEMA,
        role: plan.nextSpeaker,
        phase: plan.phase,
        provider,
        model: "",
        history: [],
        ...extra,
      }),
    })
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const INDICE_DIABLO = TURN_PLAN.findIndex((t) => t.nextSpeaker === "con");
const INDICE_ANGEL = TURN_PLAN.findIndex((t) => t.nextSpeaker === "pro");

describe("POST /api/debate/start", () => {
  it("con créditos firma las personalidades elegidas", async () => {
    const r = await start({ pro: creditos("angel-coach"), con: creditos("diablo-influencer") });
    expect(r.status).toBe(200);
    const v = verificarToken(r.json.token, secreto);
    expect(v.ok && [v.payload.pro.pe, v.payload.con.pe]).toEqual(["angel-coach", "diablo-influencer"]);
  });

  it("modo gratis con personalidad no clásica: 400 y no hay token", async () => {
    const gratis = { provider: PROVEEDOR_GRATIS, model: "" };
    const r = await start({ pro: gratis, con: { ...gratis, personalidad: "diablo-narco" } });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: MENSAJE_PERSONALIDAD_SOLO_CREDITOS });
  });

  it("id fuera del catálogo: 400 sin repetir el valor", async () => {
    const r = await start({ pro: creditos("<script>"), con: creditos() });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).not.toContain("script");
  });
});

describe("POST /api/debate: la personalidad sale del token", () => {
  function tokenCreditos(pro?: string, con?: string): string {
    return emitirToken({ topic: TEMA, pro: creditos(pro), con: creditos(con) }, secreto, Date.now(), { usuario: CUENTA }).token;
  }

  it("usa la personalidad del token aunque el cliente mande otra", async () => {
    const token = tokenCreditos("angel-abogado", "diablo-narco");
    const narco = personalidadDe("con", "diablo-narco")!;
    const abogado = personalidadDe("pro", "angel-abogado")!;

    expect((await turno(token, INDICE_DIABLO, { personalidad: "diablo-clasico" })).status).toBe(200);
    expect((await turno(token, INDICE_ANGEL, { personalidad: "angel-clasico" })).status).toBe(200);

    const [diablo, angel] = systems.map((s) => s.system);
    expect(diablo).toBe(buildSystemPrompt("con", "diablo-narco"));
    expect(diablo).toContain(narco.prompt);
    expect(angel).toBe(buildSystemPrompt("pro", "angel-abogado"));
    expect(angel).toContain(abogado.prompt);
    for (const s of [diablo, angel]) expect(s.startsWith(REGLAS_SEGURIDAD)).toBe(true);
  });

  it("el revisor de frases del Diablo se aplica con cualquier personalidad", async () => {
    for (const p of PERSONALIDADES.con) {
      revisiones = 0;
      usarRegistroTurnos(new RegistroTurnosMemoria());
      expect((await turno(tokenCreditos(undefined, p.id), INDICE_DIABLO)).status).toBe(200);
      expect(revisiones).toBe(1);
    }
  });

  it("un token de modo gratis con personalidad no clásica (forjado con el secreto) se rechaza: 403", async () => {
    const { payload } = emitirToken(
      { topic: TEMA, pro: { provider: PROVEEDOR_GRATIS, model: "" }, con: { provider: PROVEEDOR_GRATIS, model: "" } },
      secreto
    );
    const forjado = firmarPayload({ ...payload, con: { ...payload.con, pe: "diablo-cripto" } }, secreto);
    const r = await turno(forjado, INDICE_DIABLO, {}, PROVEEDOR_GRATIS);
    expect(r.status).toBe(403);
    expect(systems).toEqual([]);
  });
});
