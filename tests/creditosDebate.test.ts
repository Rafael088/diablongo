// Debates con créditos: cobro en /api/debate/start y devolución en /api/debate, contra la migración
// real (PGlite) y con la red simulada (Turnstile y OpenRouter).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { TOTAL_TURNS, TURN_PLAN } from "@/lib/debateEngine";
import {
  AVISO_RESPALDO_CREDITOS,
  CREDITOS_POR_DEBATE,
  MENSAJE_CREDITOS_DEVUELTOS,
  MENSAJE_CREDITOS_INSUFICIENTES,
  MENSAJE_CREDITOS_MEZCLA,
  MENSAJE_CREDITOS_NO_DISPONIBLE,
  MENSAJE_CREDITOS_SIN_SESION,
  MODELOS_CREDITOS,
  PROVEEDOR_CREDITOS,
} from "@/lib/creditosDebate";
import { acreditarCompra } from "@/lib/creditos";
import { PROMPT_CLASIFICADOR } from "@/lib/temaCritico";
import { RegistroTurnosMemoria, usarRegistroTurnos } from "@/lib/registroTurnos";
import { emitirToken, verificarToken } from "@/lib/tokenDebate";
import { validarProveedorModelo } from "@/lib/validarTurno";
import { modoInicial, proveedorDelModo } from "@/lib/modoConfig";
import { SECRETO_PRUEBA, TURNSTILE_PRUEBA, indiceDe } from "./ayudaToken";
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

const TEMA = "¿Gatos o perros?";
const CREDITOS = { provider: PROVEEDOR_CREDITOS, model: "" };

let base: BaseDePrueba;
/** Respuestas de OpenRouter por modelo: texto, o un status de error. */
let respuestas: Record<string, string | number>;
let llamadas: { modelo: string; key: string }[];

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
  usarRegistroTurnos(new RegistroTurnosMemoria());
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto-turnstile-de-prueba");
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-del-servidor");
  respuestas = {};
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("turnstile")) {
        return new Response(JSON.stringify({ success: true, action: "iniciar-debate" }), { status: 200 });
      }
      const cuerpo = JSON.parse(String(init?.body)) as { model: string; messages: { content: string }[] };
      // El clasificador de temas críticos (lib/temaCritico.ts) responde aparte y no cuenta como turno.
      if (cuerpo.messages?.[0]?.content === PROMPT_CLASIFICADOR) {
        return new Response(JSON.stringify({ choices: [{ message: { content: "NO" } }] }), { status: 200 });
      }
      const key = String((init?.headers as Record<string, string>).Authorization).replace("Bearer ", "");
      llamadas.push({ modelo: cuerpo.model, key });
      const r = respuestas[cuerpo.model] ?? "Respuesta del modelo";
      if (typeof r === "number") return new Response("caído", { status: r });
      return new Response(JSON.stringify({ choices: [{ message: { content: r } }] }), { status: 200 });
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

async function empezar(config: Record<string, unknown> = { pro: CREDITOS, con: CREDITOS }) {
  const res = await START(
    new NextRequest("http://localhost/api/debate/start", {
      method: "POST",
      body: JSON.stringify({ topic: TEMA, turnstile: TURNSTILE_PRUEBA, ...config }),
    })
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function turno(token: unknown, indice: number) {
  const plan = TURN_PLAN[indice];
  const cuerpo =
    indice >= TOTAL_TURNS
      ? { role: "pro", phase: "desenlace" }
      : { role: plan.nextSpeaker, phase: plan.phase };
  expect(indiceDe(cuerpo.role, cuerpo.phase)).toBe(indice);
  const res = await TURNO(
    new NextRequest("http://localhost/api/debate", {
      method: "POST",
      body: JSON.stringify({ token, indice, topic: TEMA, provider: PROVEEDOR_CREDITOS, model: "", history: [], ...cuerpo }),
    })
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const fallanTodos = () => {
  for (const m of [...MODELOS_CREDITOS.pro, ...MODELOS_CREDITOS.con]) respuestas[m] = 500;
};

describe("cobro al empezar (/api/debate/start)", () => {
  it("cobra el debate a la cuenta y firma el token con ella", async () => {
    await acreditarCompra(base.db, ANA, 3, "mp-1");
    const { status, json } = await empezar();
    expect(status).toBe(200);
    expect(json.creditos).toBe(3 - CREDITOS_POR_DEBATE);
    expect(await base.saldo(ANA)).toBe(3 - CREDITOS_POR_DEBATE);

    const v = verificarToken(json.token, Buffer.from(SECRETO_PRUEBA));
    expect(v.ok && v.payload.u).toBe(ANA);
    // El movimiento lleva el id del debate del token: con eso se devuelve.
    const r = await base.pg.query<{ referencia: string }>("select referencia from public.movimientos where motivo = 'debate'");
    expect(v.ok && r.rows[0].referencia).toBe(v.ok && v.payload.id);
  });

  it("sin saldo no empieza ni cobra (402)", async () => {
    const { status, json } = await empezar();
    expect(status).toBe(402);
    expect(json.error).toBe(MENSAJE_CREDITOS_INSUFICIENTES);
    expect(await base.movimientos(ANA)).toBe(0);
  });

  it("sin sesión pide entrar (401)", async () => {
    cuentas.usuario = null;
    const { status, json } = await empezar();
    expect(status).toBe(401);
    expect(json.error).toBe(MENSAJE_CREDITOS_SIN_SESION);
  });

  it("no se puede mezclar créditos con otro modo (400)", async () => {
    await acreditarCompra(base.db, ANA, 3, "mp-1");
    const { status, json } = await empezar({ pro: CREDITOS, con: { provider: "gratis", model: "" } });
    expect(status).toBe(400);
    expect(json.error).toBe(MENSAJE_CREDITOS_MEZCLA);
    expect(await base.saldo(ANA)).toBe(3);
  });

  it("sin cuentas o sin key del servidor no está disponible (503) y no cobra", async () => {
    await acreditarCompra(base.db, ANA, 3, "mp-1");
    cuentas.admin = null;
    expect((await empezar()).json.error).toBe(MENSAJE_CREDITOS_NO_DISPONIBLE);
    cuentas.admin = base.db;
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect((await empezar()).status).toBe(503);
    expect(await base.saldo(ANA)).toBe(3);
  });

  it("los otros modos no tocan los créditos", async () => {
    cuentas.usuario = null;
    const { status, json } = await empezar({ pro: { provider: "gratis", model: "" }, con: { provider: "gratis", model: "" } });
    expect(json.error).not.toBe(MENSAJE_CREDITOS_SIN_SESION);
    expect(status).not.toBe(402);
  });
});

describe("turnos con créditos (/api/debate)", () => {
  async function debatePagado() {
    await acreditarCompra(base.db, ANA, 5, "mp-1");
    const { json } = await empezar();
    return json.token;
  }

  it("usa la key del servidor y un modelo de pago, nunca lo que mande el cliente", async () => {
    const token = await debatePagado();
    const r = await turno(token, 0);
    expect(r.status).toBe(200);
    expect(r.json.content).toBe("Respuesta del modelo");
    expect(llamadas).toEqual([{ modelo: MODELOS_CREDITOS[TURN_PLAN[0].nextSpeaker][0], key: "sk-or-del-servidor" }]);
    expect(await base.saldo(ANA)).toBe(5 - CREDITOS_POR_DEBATE);
  });

  it("si un modelo falla prueba el siguiente y avisa, sin devolver nada", async () => {
    const token = await debatePagado();
    const rol = TURN_PLAN[0].nextSpeaker;
    respuestas[MODELOS_CREDITOS[rol][0]] = 401;
    const r = await turno(token, 0);
    expect(r.status).toBe(200);
    expect(r.json.aviso).toBe(AVISO_RESPALDO_CREDITOS);
    expect(await base.saldo(ANA)).toBe(5 - CREDITOS_POR_DEBATE);
  });

  it("si fallan todos los modelos en mitad del debate devuelve el crédito una vez y cierra el debate", async () => {
    const token = await debatePagado();
    expect((await turno(token, 0)).status).toBe(200);
    fallanTodos();

    const r = await turno(token, 1);
    expect(r.status).toBe(503);
    expect(r.json).toMatchObject({ error: MENSAJE_CREDITOS_DEVUELTOS, devuelto: true, terminado: true });
    expect(await base.saldo(ANA)).toBe(5);

    // Ni reintentar ese turno ni jugar los siguientes: el debate quedó cerrado tras la devolución.
    respuestas = {};
    for (const i of [1, 2, TOTAL_TURNS]) expect((await turno(token, i)).status).toBe(409);
    expect(await base.saldo(ANA)).toBe(5);
  });

  it("si falla el desenlace no devuelve (el cliente tiene plantilla) y se puede reintentar", async () => {
    const token = await debatePagado();
    fallanTodos();
    const r = await turno(token, TOTAL_TURNS);
    expect(r.status).toBe(503);
    expect(r.json.devuelto).toBeUndefined();
    expect(await base.saldo(ANA)).toBe(5 - CREDITOS_POR_DEBATE);
    respuestas = {};
    expect((await turno(token, TOTAL_TURNS)).status).toBe(200);
  });

  it("un token de créditos sin cuenta no juega (403)", async () => {
    const { token } = emitirToken({ topic: TEMA, pro: CREDITOS, con: CREDITOS }, Buffer.from(SECRETO_PRUEBA));
    const r = await turno(token, 0);
    expect(r.status).toBe(403);
    expect(llamadas).toEqual([]);
  });

  it("la devolución es a quien pagó, aunque otra persona tenga sesión", async () => {
    const token = await debatePagado();
    await acreditarCompra(base.db, BETO, 1, "mp-2");
    cuentas.usuario = BETO;
    fallanTodos();
    await turno(token, 0);
    expect(await base.saldo(ANA)).toBe(5);
    expect(await base.saldo(BETO)).toBe(1);
  });
});

describe("piezas del modo créditos", () => {
  it("la validación ignora modelo y key del cliente", () => {
    const r = validarProveedorModelo(PROVEEDOR_CREDITOS, "openai/gpt-carisimo");
    expect(r).toMatchObject({ ok: true, model: "", delServidor: true, esGratis: false });
  });

  it("el selector da el proveedor créditos y no abre en créditos sin cuentas", () => {
    expect(proveedorDelModo("creditos", "groq")).toBe(PROVEEDOR_CREDITOS);
    expect(modoInicial({ modo: "creditos" }, false, true)).toBe("creditos");
    expect(modoInicial({ modo: "creditos" }, false, false)).toBe("gratis");
  });

  it("los modelos de pago no son :free y Ángel y Diablo empiezan con modelos distintos", () => {
    for (const m of [...MODELOS_CREDITOS.pro, ...MODELOS_CREDITOS.con]) expect(m.endsWith(":free")).toBe(false);
    expect(MODELOS_CREDITOS.pro[0]).not.toBe(MODELOS_CREDITOS.con[0]);
  });
});
