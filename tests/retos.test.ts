// Retos (v0.4.0): la migración de verdad sobre PGlite (RLS, idempotencia, voto único) y el flujo
// completo de servidor: /api/debate/start → 9 turnos de /api/debate → POST /api/retos, con la red simulada.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { TOTAL_TURNS, TURN_PLAN } from "@/lib/debateEngine";
import { PROVEEDOR_CREDITOS } from "@/lib/creditosDebate";
import { acreditarCompra, descontarDebate, devolverDebate } from "@/lib/creditos";
import { PROMPT_CLASIFICADOR } from "@/lib/temaCritico";
import { PROMPT_REVISOR, fraseSegura } from "@/lib/revisarFrase";
import { RegistroTurnosMemoria, usarRegistroTurnos } from "@/lib/registroTurnos";
import {
  LARGO_ID_RETO,
  MENSAJE_RETO_DEVUELTO,
  MENSAJE_RETO_SIN_COBRO,
  MENSAJE_RETO_SIN_SESION,
  MENSAJE_RETO_SIN_TERMINAR,
  crearReto,
  esIdReto,
  generarIdReto,
  huellaVotante,
  leerReto,
  nuevoIdVotante,
  registrarFrase,
  registrarVoto,
  retosDeUsuario,
} from "@/lib/retos";
import { SECRETO_PRUEBA, TURNSTILE_PRUEBA } from "./ayudaToken";
import { ANA, BETO, crearBaseDePrueba, type BaseDePrueba } from "./ayudaPg";

const cuentas = vi.hoisted(() => ({ usuario: null as string | null, admin: null as unknown }));
vi.mock("@/lib/supabase/servidor", () => ({
  clienteServidor: async () => ({
    auth: { getUser: async () => ({ data: { user: cuentas.usuario ? { id: cuentas.usuario } : null }, error: null }) },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ clienteAdmin: () => cuentas.admin }));

import { POST as START } from "@/app/api/debate/start/route";
import { POST as TURNO } from "@/app/api/debate/route";
import { POST as RETOS } from "@/app/api/retos/route";

const TEMA = "¿Renuncio para viajar?";
const CREDITOS = { provider: PROVEEDOR_CREDITOS, model: "" };
const DEBATE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEBATE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let base: BaseDePrueba;
let generadas: number;
/** Veredicto del revisor de frases del Diablo. */
let revisor: string;

beforeAll(async () => {
  base = await crearBaseDePrueba();
}, 30_000);
afterAll(async () => {
  await base?.pg.close();
});

beforeEach(async () => {
  await base.reiniciar();
  cuentas.usuario = ANA;
  cuentas.admin = base.db;
  generadas = 0;
  revisor = "SEGURA";
  usarRegistroTurnos(new RegistroTurnosMemoria());
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto-turnstile-de-prueba");
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-del-servidor");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("turnstile")) {
        return new Response(JSON.stringify({ success: true, action: "iniciar-debate" }), { status: 200 });
      }
      const cuerpo = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      const sistema = cuerpo.messages?.[0]?.content;
      const content =
        sistema === PROMPT_CLASIFICADOR ? "NO" : sistema === PROMPT_REVISOR ? revisor : `Frase del servidor ${++generadas}`;
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pedir = (handler: (r: NextRequest) => Promise<Response>, ruta: string, cuerpo: unknown) =>
  handler(new NextRequest(`http://localhost${ruta}`, { method: "POST", body: JSON.stringify(cuerpo) })).then(async (res) => ({
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  }));

async function empezar(config: Record<string, unknown> = { pro: CREDITOS, con: CREDITOS }) {
  return pedir(START, "/api/debate/start", { topic: TEMA, turnstile: TURNSTILE_PRUEBA, ...config });
}

async function turno(token: unknown, indice: number, extra: Record<string, unknown> = {}) {
  const plan = TURN_PLAN[indice];
  const cuerpo = indice >= TOTAL_TURNS ? { role: "con", phase: "desenlace" } : { role: plan.nextSpeaker, phase: plan.phase };
  return pedir(TURNO, "/api/debate", { token, indice, topic: TEMA, history: [], ...CREDITOS, ...cuerpo, ...extra });
}

/** Debate con créditos de Ana, con personalidades, jugado hasta `hasta` (incluido). Devuelve el id. */
async function debateJugado(hasta = TOTAL_TURNS): Promise<string> {
  await acreditarCompra(base.db, ANA, 5, `mp-${Math.random()}`);
  const { status, json } = await empezar({
    pro: { ...CREDITOS, personalidad: "angel-abuela" },
    con: { ...CREDITOS, personalidad: "diablo-influencer" },
  });
  expect(status).toBe(200);
  for (let i = 0; i <= hasta; i++) expect((await turno(json.token, i)).status).toBe(200);
  return String(json.debate);
}

const crear = (cuerpo: unknown) => pedir(RETOS, "/api/retos", cuerpo);

/** Guarda directamente en la base las 8 frases de un debate ya cobrado (pruebas de SQL). */
async function frasesEnBase(usuario: string, debate: string) {
  for (let i = 0; i < TOTAL_TURNS; i++) {
    await registrarFrase(base.db, {
      usuario,
      debate,
      indice: i,
      rol: TURN_PLAN[i].nextSpeaker,
      personalidad: TURN_PLAN[i].nextSpeaker === "pro" ? "angel-clasico" : "diablo-clasico",
      tema: TEMA,
      texto: `frase ${i}`,
    });
  }
}

describe("crear un reto (POST /api/retos)", () => {
  it("guarda tema, frases y personalidades que generó el servidor, con la elección de quien lo creó", async () => {
    const debate = await debateJugado();
    const r = await crear({ debate, eleccion: "con" });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ creado: true, ruta: `/r/${r.json.id}` });
    expect(esIdReto(r.json.id)).toBe(true);

    const reto = await leerReto(base.db, String(r.json.id));
    expect(reto).toMatchObject({
      id: r.json.id,
      tema: TEMA,
      personalidades: { pro: "angel-abuela", con: "diablo-influencer" },
      eleccion: "con",
      votos: { pro: 0, con: 0 },
    });
    expect(reto!.frases).toEqual(
      Array.from({ length: TOTAL_TURNS + 1 }, (_, i) => ({
        indice: i,
        rol: i < TOTAL_TURNS ? TURN_PLAN[i].nextSpeaker : "con",
        texto: `Frase del servidor ${i + 1}`,
      }))
    );
    // Copiadas al reto, las frases de trabajo se borran.
    const quedan = await base.pg.query("select 1 from public.debate_frases");
    expect(quedan.rows).toHaveLength(0);
  });

  it("guarda la frase ya revisada (la que vio la persona), no la primera que dio el modelo", async () => {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    const { json } = await empezar();
    revisor = "INSEGURA";
    for (let i = 0; i < TOTAL_TURNS; i++) await turno(json.token, i);
    const r = await crear({ debate: json.debate, eleccion: "pro" });
    const reto = await leerReto(base.db, String(r.json.id));
    expect(reto!.frases[1].texto).toBe(fraseSegura(false, 1));
    expect(reto!.frases[0].texto).toMatch(/^Frase del servidor/);
  });

  it("rechaza frases, tema o personalidades mandadas por el navegador (400) y no crea nada", async () => {
    const debate = await debateJugado();
    for (const extra of [
      { frases: [{ indice: 0, rol: "pro", texto: "inventada" }] },
      { tema: "otro tema" },
      { personalidades: { pro: "angel-coach", con: "diablo-cripto" } },
    ]) {
      const r = await crear({ debate, eleccion: "pro", ...extra });
      expect(r.status).toBe(400);
    }
    const retos = await base.pg.query("select 1 from public.retos");
    expect(retos.rows).toHaveLength(0);
  });

  it("un turno no puede colar frases propias: lo guardado es lo generado, no el historial del cliente", async () => {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    const { json } = await empezar();
    for (let i = 0; i < TOTAL_TURNS; i++) {
      await turno(json.token, i, { history: [{ role: "pro", content: "frase inventada por el navegador" }] });
    }
    const r = await crear({ debate: json.debate, eleccion: "pro" });
    const reto = await leerReto(base.db, String(r.json.id));
    expect(JSON.stringify(reto!.frases)).not.toContain("inventada");
  });

  it("valida la elección (solo pro o con) y el id del debate", async () => {
    const debate = await debateJugado();
    for (const eleccion of [undefined, "ambos", "PRO", 1]) {
      expect((await crear({ debate, eleccion })).status).toBe(400);
    }
    expect((await crear({ debate: "no-es-un-uuid", eleccion: "pro" })).status).toBe(400);
    expect((await crear("texto")).status).toBe(400);
  });

  it("es idempotente: un debate genera un solo reto y la elección no cambia", async () => {
    const debate = await debateJugado();
    const a = await crear({ debate, eleccion: "pro" });
    const b = await crear({ debate, eleccion: "con" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json).toMatchObject({ id: a.json.id, creado: false });
    expect((await leerReto(base.db, String(a.json.id)))!.eleccion).toBe("pro");
    expect((await base.pg.query("select 1 from public.retos")).rows).toHaveLength(1);
  });

  it("un debate sin créditos no genera reto (403) ni guarda frases", async () => {
    cuentas.usuario = ANA;
    const { status, json } = await empezar({
      pro: { provider: "openrouter", model: "anthropic/claude-haiku-5.5" },
      con: { provider: "openrouter", model: "anthropic/claude-haiku-5.5" },
    });
    expect(status).toBe(200);
    for (let i = 0; i < TOTAL_TURNS; i++) {
      const plan = TURN_PLAN[i];
      await pedir(TURNO, "/api/debate", {
        token: json.token,
        indice: i,
        topic: TEMA,
        history: [],
        provider: "openrouter",
        model: "anthropic/claude-haiku-5.5",
        apiKey: "sk-or-de-la-persona",
        role: plan.nextSpeaker,
        phase: plan.phase,
      });
    }
    expect((await base.pg.query("select 1 from public.debate_frases")).rows).toHaveLength(0);
    const r = await crear({ debate: json.debate, eleccion: "pro" });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe(MENSAJE_RETO_SIN_COBRO);
  });

  it("un debate sin terminar no genera reto (409)", async () => {
    const debate = await debateJugado(TOTAL_TURNS - 2);
    const r = await crear({ debate, eleccion: "pro" });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe(MENSAJE_RETO_SIN_TERMINAR);
  });

  it("vale sin desenlace (el cliente usa su plantilla si falla)", async () => {
    const debate = await debateJugado(TOTAL_TURNS - 1);
    const r = await crear({ debate, eleccion: "pro" });
    expect(r.status).toBe(201);
    expect((await leerReto(base.db, String(r.json.id)))!.frases).toHaveLength(TOTAL_TURNS);
  });

  it("solo la cuenta dueña del debate lo convierte en reto; sin sesión, 401", async () => {
    const debate = await debateJugado();
    cuentas.usuario = BETO;
    const r = await crear({ debate, eleccion: "pro" });
    expect(r.status).toBe(403);
    cuentas.usuario = null;
    const s = await crear({ debate, eleccion: "pro" });
    expect(s.status).toBe(401);
    expect(s.json.error).toBe(MENSAJE_RETO_SIN_SESION);
    expect((await base.pg.query("select 1 from public.retos")).rows).toHaveLength(0);
  });

  it("sin Supabase responde 503", async () => {
    cuentas.admin = null;
    expect((await crear({ debate: DEBATE_A, eleccion: "pro" })).status).toBe(503);
  });
});

describe("esquema de retos (SQL)", () => {
  it("no guarda frases de un debate que no se cobró a esa cuenta", async () => {
    await expect(
      registrarFrase(base.db, { usuario: ANA, debate: DEBATE_A, indice: 0, rol: "pro", personalidad: "angel-clasico", tema: TEMA, texto: "x" })
    ).rejects.toThrow(/debate_sin_cobro/);
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    await descontarDebate(base.db, ANA, 1, DEBATE_A);
    await expect(
      registrarFrase(base.db, { usuario: BETO, debate: DEBATE_A, indice: 0, rol: "pro", personalidad: "angel-clasico", tema: TEMA, texto: "x" })
    ).rejects.toThrow(/debate_sin_cobro/);
  });

  it("un turno se guarda una vez, con el personaje del plan, sin cambiar tema ni personalidad", async () => {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    await descontarDebate(base.db, ANA, 1, DEBATE_A);
    const f = { usuario: ANA, debate: DEBATE_A, indice: 0, rol: "pro" as const, personalidad: "angel-clasico", tema: TEMA, texto: "uno" };
    expect(await registrarFrase(base.db, f)).toBe(true);
    expect(await registrarFrase(base.db, { ...f, texto: "otra" })).toBe(false);
    await expect(registrarFrase(base.db, { ...f, indice: 1 })).rejects.toThrow(/check/);
    await expect(registrarFrase(base.db, { ...f, indice: 2, tema: "otro" })).rejects.toThrow(/debate_ajeno/);
    await expect(registrarFrase(base.db, { ...f, indice: 2, personalidad: "angel-coach" })).rejects.toThrow(/personalidad_distinta/);
  });

  it("no crea reto de un debate devuelto", async () => {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    await descontarDebate(base.db, ANA, 1, DEBATE_A);
    await frasesEnBase(ANA, DEBATE_A);
    await devolverDebate(base.db, ANA, DEBATE_A);
    expect(await crearReto(base.db, ANA, DEBATE_A, "pro")).toEqual({ ok: false, motivo: "devuelto" });
    expect(MENSAJE_RETO_DEVUELTO).toBeTruthy();
  });

  it("si el id aleatorio choca con otro reto, reintenta con otro", async () => {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    for (const d of [DEBATE_A, DEBATE_B]) {
      await descontarDebate(base.db, ANA, 1, d);
      await frasesEnBase(ANA, d);
    }
    const ids = ["AAAAAAAAAA", "AAAAAAAAAA", "BBBBBBBBBB"];
    expect(await crearReto(base.db, ANA, DEBATE_A, "pro", () => ids.shift()!)).toEqual({ ok: true, id: "AAAAAAAAAA", creado: true });
    expect(await crearReto(base.db, ANA, DEBATE_B, "con", () => ids.shift()!)).toEqual({ ok: true, id: "BBBBBBBBBB", creado: true });
  });

  it("los ids cortos son url-safe, de 10 caracteres y no se repiten", () => {
    const ids = new Set(Array.from({ length: 2000 }, generarIdReto));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(id).toMatch(new RegExp(`^[A-Za-z0-9_-]{${LARGO_ID_RETO}}$`));
  });

  it("un voto por navegador: repetir no suma ni cambia el voto", async () => {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    await descontarDebate(base.db, ANA, 1, DEBATE_A);
    await frasesEnBase(ANA, DEBATE_A);
    const reto = await crearReto(base.db, ANA, DEBATE_A, "pro");
    const id = reto.ok ? reto.id : "";
    const yo = nuevoIdVotante();
    const otro = nuevoIdVotante();

    expect(await registrarVoto(base.db, id, yo, "con")).toEqual({ ok: true, registrado: true, voto: "con", votos: { pro: 0, con: 1 } });
    expect(await registrarVoto(base.db, id, yo, "pro")).toEqual({ ok: true, registrado: false, voto: "con", votos: { pro: 0, con: 1 } });
    expect(await registrarVoto(base.db, id, otro, "pro")).toEqual({ ok: true, registrado: true, voto: "pro", votos: { pro: 1, con: 1 } });
    expect((await leerReto(base.db, id))!.votos).toEqual({ pro: 1, con: 1 });
    expect(await registrarVoto(base.db, "noexiste12", yo, "pro")).toEqual({ ok: false, motivo: "no_existe" });
    await expect(registrarVoto(base.db, id, "corto", "pro")).rejects.toThrow();

    // Lo guardado es la huella, no el identificador de la cookie.
    const v = await base.pg.query<{ votante: string }>("select votante from public.votos_reto order by creado_en");
    expect(v.rows.map((r) => r.votante)).toContain(huellaVotante(yo));
    expect(JSON.stringify(v.rows)).not.toContain(yo);
  });

  it("lista los retos de una cuenta con sus votos, solo los suyos", async () => {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    await acreditarCompra(base.db, BETO, 5, "mp-2");
    await descontarDebate(base.db, ANA, 1, DEBATE_A);
    await descontarDebate(base.db, BETO, 1, DEBATE_B);
    await frasesEnBase(ANA, DEBATE_A);
    await frasesEnBase(BETO, DEBATE_B);
    const a = await crearReto(base.db, ANA, DEBATE_A, "con");
    await crearReto(base.db, BETO, DEBATE_B, "pro");
    await registrarVoto(base.db, a.ok ? a.id : "", nuevoIdVotante(), "pro");

    const lista = await retosDeUsuario(base.db, ANA);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: a.ok && a.id, tema: TEMA, eleccion: "con", votos: { pro: 1, con: 0 } });
    expect(lista[0]).not.toHaveProperty("frases");
    expect(await retosDeUsuario(base.db, "33333333-3333-4333-8333-333333333333")).toEqual([]);
  });

  it("RLS: el navegador no lee ni escribe retos, votos ni frases; leer por id es lo único público", async () => {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    await descontarDebate(base.db, ANA, 1, DEBATE_A);
    await frasesEnBase(ANA, DEBATE_A);
    await descontarDebate(base.db, ANA, 1, DEBATE_B);
    await registrarFrase(base.db, { usuario: ANA, debate: DEBATE_B, indice: 0, rol: "pro", personalidad: "angel-clasico", tema: TEMA, texto: "x" });
    const r = await crearReto(base.db, ANA, DEBATE_A, "pro");
    const id = r.ok ? r.id : "";
    await registrarVoto(base.db, id, nuevoIdVotante(), "pro");

    for (const [rol, sub] of [["anon", undefined], ["authenticated", BETO]] as const) {
      await base.como(rol, sub);
      expect((await base.pg.query("select * from public.retos")).rows).toHaveLength(0);
      await expect(base.pg.query("select * from public.votos_reto")).rejects.toThrow(/permission denied/);
      await expect(base.pg.query("select * from public.debate_frases")).rejects.toThrow(/permission denied/);
      await expect(
        base.pg.query(
          "insert into public.retos (id, debate_id, usuario_id, tema, frases, personalidad_pro, personalidad_con, eleccion) values ('ZZZZZZZZZZ', $1, $2, 't', '[]', 'a', 'b', 'pro')",
          ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", ANA]
        )
      ).rejects.toThrow(/permission denied/);
      await expect(base.pg.query("insert into public.votos_reto (reto_id, votante, voto) values ($1, $2, 'con')", [id, "a".repeat(64)])).rejects.toThrow(
        /permission denied/
      );
      for (const sql of [
        `select * from public.crear_reto('${ANA}', '${DEBATE_B}', 'pro', 'YYYYYYYYYY')`,
        `select * from public.votar_reto('${id}', '${"b".repeat(64)}', 'con')`,
        `select * from public.retos_de_usuario('${ANA}')`,
        `select public.registrar_frase('${ANA}', '${DEBATE_B}', 1, 'con', 'diablo-clasico', 't', 'x')`,
      ]) {
        await expect(base.pg.query(sql), sql).rejects.toThrow(/permission denied/);
      }
      // Leer por id sí, sin la cuenta que lo creó.
      const leido = await base.pg.query<Record<string, unknown>>("select * from public.leer_reto($1)", [id]);
      expect(leido.rows).toHaveLength(1);
      expect(leido.rows[0]).not.toHaveProperty("usuario_id");
      expect(leido.rows[0]).not.toHaveProperty("debate_id");
      expect(leido.rows[0].votos_pro).toBe(1);
    }

    // La dueña ve sus retos con su sesión (para Ajustes), pero no puede tocarlos.
    await base.como("authenticated", ANA);
    expect((await base.pg.query("select id from public.retos")).rows).toEqual([{ id }]);
    await expect(base.pg.query("update public.retos set eleccion = 'con'")).rejects.toThrow(/permission denied/);
    await expect(base.pg.query("delete from public.retos")).rejects.toThrow(/permission denied/);
    await base.como("service_role");
  });
});
