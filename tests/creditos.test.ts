import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { acreditarCompra, descontarDebate, devolverDebate, ErrorCreditos, type LlamadorRpc } from "@/lib/creditos";
import { ANA, BETO, crearBaseDePrueba, type BaseDePrueba } from "./ayudaPg";

let base: BaseDePrueba;
let pg: PGlite;
let db: LlamadorRpc;
const como: BaseDePrueba["como"] = (rol, sub) => base.como(rol, sub);
const saldo = (u: string) => base.saldo(u);
const movimientos = (u: string) => base.movimientos(u);

beforeAll(async () => {
  base = await crearBaseDePrueba();
  ({ pg, db } = base);
}, 30_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  await base.reiniciar();
});

describe("esquema de cuentas y créditos (SQL)", () => {
  it("una cuenta nueva arranca con saldo 0", async () => {
    expect(await saldo(ANA)).toBe(0);
    expect(await saldo(BETO)).toBe(0);
  });

  it("un pago acredita una sola vez aunque el webhook llegue repetido", async () => {
    expect(await acreditarCompra(db, ANA, 50, "mp-123")).toEqual({ acreditado: true, saldo: 50 });
    expect(await acreditarCompra(db, ANA, 50, "mp-123")).toEqual({ acreditado: false, saldo: 50 });
    expect(await acreditarCompra(db, ANA, 20, "mp-124")).toEqual({ acreditado: true, saldo: 70 });
    expect(await movimientos(ANA)).toBe(2);
  });

  it("descontar no deja el saldo en negativo ni deja rastro si no alcanza", async () => {
    await acreditarCompra(db, ANA, 5, "mp-1");
    expect(await descontarDebate(db, ANA, 9, "debate-a")).toEqual({ ok: false, motivo: "saldo_insuficiente" });
    expect(await saldo(ANA)).toBe(5);
    expect(await movimientos(ANA)).toBe(1);
  });

  it("un debate se cobra una sola vez aunque se reintente", async () => {
    await acreditarCompra(db, ANA, 30, "mp-1");
    expect(await descontarDebate(db, ANA, 10, "debate-a")).toEqual({ ok: true, cobrado: true, saldo: 20 });
    expect(await descontarDebate(db, ANA, 10, "debate-a")).toEqual({ ok: true, cobrado: false, saldo: 20 });
  });

  it("no se puede reusar el id de debate de otra persona", async () => {
    await acreditarCompra(db, ANA, 30, "mp-1");
    await acreditarCompra(db, BETO, 30, "mp-2");
    await descontarDebate(db, ANA, 10, "debate-a");
    await expect(descontarDebate(db, BETO, 10, "debate-a")).rejects.toThrow(/debate_ajeno/);
    expect(await saldo(BETO)).toBe(30);
  });

  it("la devolución devuelve lo cobrado una sola vez y solo a quien pagó", async () => {
    await acreditarCompra(db, ANA, 30, "mp-1");
    await descontarDebate(db, ANA, 10, "debate-a");
    expect(await devolverDebate(db, BETO, "debate-a")).toEqual({ devuelto: false, saldo: 0 });
    expect(await devolverDebate(db, ANA, "debate-a")).toEqual({ devuelto: true, saldo: 30 });
    expect(await devolverDebate(db, ANA, "debate-a")).toEqual({ devuelto: false, saldo: 30 });
    expect(await devolverDebate(db, ANA, "debate-que-no-existe")).toEqual({ devuelto: false, saldo: 30 });
  });

  it("rechaza cantidades de créditos inválidas en la base", async () => {
    const { error } = await db.rpc("acreditar_compra", { p_usuario: ANA, p_creditos: 0, p_pago: "mp-x" });
    expect(error?.message).toMatch(/creditos_invalidos/);
  });

  it("desde el navegador cada persona solo ve su saldo y no puede escribirlo", async () => {
    await acreditarCompra(db, ANA, 40, "mp-1");
    await acreditarCompra(db, BETO, 7, "mp-2");

    await como("authenticated", ANA);
    const visibles = await pg.query<{ usuario_id: string; creditos: number }>("select usuario_id, creditos from public.saldos");
    expect(visibles.rows).toEqual([{ usuario_id: ANA, creditos: 40 }]);
    await expect(pg.query("update public.saldos set creditos = 9999")).rejects.toThrow(/permission denied/);
    await expect(pg.query("insert into public.movimientos (usuario_id, delta, motivo, referencia) values ($1, 100, 'ajuste', 'yo')", [ANA])).rejects.toThrow(/permission denied/);

    await como("anon");
    expect((await pg.query("select * from public.saldos")).rows).toEqual([]);
  });

  it("solo el servidor (service_role) puede mover créditos", async () => {
    for (const rol of ["authenticated", "anon"] as const) {
      await como(rol, ANA);
      const { error } = await db.rpc("acreditar_compra", { p_usuario: ANA, p_creditos: 1000, p_pago: `trampa-${rol}` });
      expect(error?.message).toMatch(/permission denied/);
      const r = await db.rpc("devolver_debate", { p_usuario: ANA, p_debate: "x" });
      expect(r.error?.message).toMatch(/permission denied/);
    }
    expect(await saldo(ANA)).toBe(0);
  });
});

describe("lib/creditos (envoltorio)", () => {
  const conError = (message: string): LlamadorRpc => ({ rpc: async () => ({ data: null, error: { message } }) });

  it("no llama a la base con cantidades inválidas", async () => {
    let llamadas = 0;
    const espia: LlamadorRpc = { rpc: async () => (llamadas++, { data: [], error: null }) };
    await expect(acreditarCompra(espia, ANA, 0, "mp")).rejects.toBeInstanceOf(ErrorCreditos);
    await expect(descontarDebate(espia, ANA, 1.5, "d")).rejects.toBeInstanceOf(ErrorCreditos);
    expect(llamadas).toBe(0);
  });

  it("un error de la base que no es de saldo se propaga", async () => {
    await expect(descontarDebate(conError("connection refused"), ANA, 9, "d")).rejects.toThrow(/connection refused/);
    await expect(acreditarCompra(conError("boom"), ANA, 9, "mp")).rejects.toThrow(/boom/);
  });

  it("una respuesta vacía es un error, no un saldo 0", async () => {
    const vacio: LlamadorRpc = { rpc: async () => ({ data: [], error: null }) };
    await expect(devolverDebate(vacio, ANA, "d")).rejects.toBeInstanceOf(ErrorCreditos);
  });
});
