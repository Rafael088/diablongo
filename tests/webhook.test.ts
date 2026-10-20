import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { decidirPago, firmaValida, leerReferencia, manifiestoFirma } from "@/lib/webhookMp";
import { ANA, crearBaseDePrueba, type BaseDePrueba } from "./ayudaPg";

const admin = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ clienteAdmin: () => admin.cliente }));
import { POST } from "@/app/api/pagos/webhook/route";

const SECRETO = "secreto-de-prueba";
const INTENTO = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("firma x-signature", () => {
  // Vectores calculados aparte con: printf '<manifiesto>' | openssl dgst -sha256 -hmac secreto-de-prueba
  const CON_REQUEST_ID = "dbb4e633fa3ba22957dca71a52b96d305089343947ae921abaa67a9a18f8f9fd";
  const SIN_REQUEST_ID = "53ac0b794878af7ce1dd6628adeda29094e869a1ab1944039638597d10afb91c";
  const REQ = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";

  it("arma el manifiesto como el SDK oficial y omite lo que falta", () => {
    expect(manifiestoFirma("123456", REQ, "1704908010")).toBe(`id:123456;request-id:${REQ};ts:1704908010;`);
    expect(manifiestoFirma("123456", undefined, "1704908010")).toBe("id:123456;ts:1704908010;");
    expect(manifiestoFirma(undefined, undefined, "1")).toBe("ts:1;");
  });

  it("acepta la firma correcta (con y sin x-request-id, v1 en mayúsculas o con espacios)", () => {
    const base = { xRequestId: REQ, dataId: "123456", secreto: SECRETO };
    expect(firmaValida({ ...base, xSignature: `ts=1704908010,v1=${CON_REQUEST_ID}` })).toBe(true);
    expect(firmaValida({ ...base, xSignature: ` ts = 1704908010 , v1 = ${CON_REQUEST_ID.toUpperCase()} ` })).toBe(true);
    expect(firmaValida({ ...base, xRequestId: null, xSignature: `ts=1704908010,v1=${SIN_REQUEST_ID}` })).toBe(true);
  });

  it("rechaza otra clave, otro pago, otra hora o una cabecera rota", () => {
    const firma = `ts=1704908010,v1=${CON_REQUEST_ID}`;
    expect(firmaValida({ xSignature: firma, xRequestId: REQ, dataId: "123456", secreto: "otra" })).toBe(false);
    expect(firmaValida({ xSignature: firma, xRequestId: REQ, dataId: "999999", secreto: SECRETO })).toBe(false);
    expect(firmaValida({ xSignature: `ts=1704908011,v1=${CON_REQUEST_ID}`, xRequestId: REQ, dataId: "123456", secreto: SECRETO })).toBe(false);
    for (const rota of [null, "", "v1=abc", "ts=1704908010", "ts=abc,v1=" + CON_REQUEST_ID, "basura"]) {
      expect(firmaValida({ xSignature: rota, xRequestId: REQ, dataId: "123456", secreto: SECRETO })).toBe(false);
    }
    expect(firmaValida({ xSignature: firma, xRequestId: REQ, dataId: "123456", secreto: "" })).toBe(false);
  });
});

describe("referencia y decisión", () => {
  const aprobado = {
    id: 123456,
    status: "approved",
    external_reference: `${ANA}:basico:${INTENTO}`,
    transaction_amount: 5000,
    currency_id: "COP",
  };

  it("lee la external_reference que arma la preferencia", () => {
    expect(leerReferencia(`${ANA}:popular:${INTENTO}`)).toMatchObject({ usuario: ANA, paquete: { id: "popular", creditos: 30 } });
    for (const mala of [null, 42, "", `${ANA}:inventado:${INTENTO}`, `${ANA}:basico`, `${ANA}:basico:${INTENTO}:x`, `ana:basico:${INTENTO}`]) {
      expect(leerReferencia(mala)).toBeNull();
    }
  });

  it("solo un pago aprobado, en COP y con el monto del paquete acredita", () => {
    expect(decidirPago(aprobado, "123456")).toEqual({ accion: "acreditar", usuario: ANA, creditos: 10, pagoId: "123456" });
    expect(decidirPago({ ...aprobado, status: "pending" }, "123456").accion).toBe("ignorar");
    expect(decidirPago({ ...aprobado, status: "rejected" }, "123456").accion).toBe("ignorar");
    expect(decidirPago({ ...aprobado, transaction_amount: 4999 }, "123456").accion).toBe("alerta");
    expect(decidirPago({ ...aprobado, currency_id: "USD" }, "123456").accion).toBe("alerta");
    expect(decidirPago({ ...aprobado, external_reference: "de-otra-tienda" }, "123456").accion).toBe("alerta");
    expect(decidirPago(aprobado, "777").accion).toBe("alerta");
  });
});

describe("POST /api/pagos/webhook", () => {
  let base: BaseDePrueba;
  const fetchReal = globalThis.fetch;
  let pagoMp: { status: number; cuerpo?: unknown };
  let consultas: string[];

  beforeAll(async () => {
    base = await crearBaseDePrueba();
  }, 30_000);
  afterAll(async () => {
    await base?.pg.close();
  });

  beforeEach(async () => {
    await base.reiniciar();
    admin.cliente = base.db;
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO);
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "APP_USR-token-de-prueba");
    consultas = [];
    pagoMp = {
      status: 200,
      cuerpo: { id: 123456, status: "approved", external_reference: `${ANA}:basico:${INTENTO}`, transaction_amount: 5000, currency_id: "COP" },
    };
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      consultas.push(String(url));
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer APP_USR-token-de-prueba");
      return new Response(JSON.stringify(pagoMp.cuerpo ?? {}), { status: pagoMp.status });
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = fetchReal;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function aviso(opts: { dataId?: string; tipo?: string; secreto?: string; firma?: string | null } = {}) {
    const dataId = opts.dataId ?? "123456";
    const ts = "1704908010";
    const requestId = "req-1";
    const v1 = createHmac("sha256", opts.secreto ?? SECRETO).update(manifiestoFirma(dataId, requestId, ts)).digest("hex");
    const headers: Record<string, string> = { "x-request-id": requestId, "content-type": "application/json" };
    const firma = opts.firma === undefined ? `ts=${ts},v1=${v1}` : opts.firma;
    if (firma !== null) headers["x-signature"] = firma;
    return new NextRequest(`http://localhost/api/pagos/webhook?data.id=${encodeURIComponent(dataId)}&type=${opts.tipo ?? "payment"}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type: opts.tipo ?? "payment", action: "payment.updated", data: { id: dataId } }),
    });
  }

  it("acredita un pago aprobado una sola vez aunque el aviso llegue repetido", async () => {
    const r1 = await POST(aviso());
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ acreditado: true });
    expect(consultas).toEqual(["https://api.mercadopago.com/v1/payments/123456"]);

    const r2 = await POST(aviso());
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ acreditado: false });
    expect(await base.saldo(ANA)).toBe(10);
    expect(await base.movimientos(ANA)).toBe(1);
  });

  it("con firma inválida o sin firma responde 401 y ni siquiera consulta el pago", async () => {
    expect((await POST(aviso({ secreto: "otra-clave" }))).status).toBe(401);
    expect((await POST(aviso({ firma: null }))).status).toBe(401);
    expect(consultas).toEqual([]);
    expect(await base.saldo(ANA)).toBe(0);
  });

  it("un pago pendiente o rechazado no acredita (se acreditará cuando llegue el aviso de aprobado)", async () => {
    pagoMp.cuerpo = { ...(pagoMp.cuerpo as object), status: "pending" };
    const r = await POST(aviso());
    expect(r.status).toBe(200);
    expect(await base.saldo(ANA)).toBe(0);
  });

  it("si el monto no cuadra no acredita y no pide reintento", async () => {
    pagoMp.cuerpo = { ...(pagoMp.cuerpo as object), transaction_amount: 100 };
    const r = await POST(aviso());
    expect(r.status).toBe(200);
    expect(await base.saldo(ANA)).toBe(0);
  });

  it("avisos que no son de pago se ignoran sin consultar nada", async () => {
    const r = await POST(aviso({ tipo: "merchant_order" }));
    expect(r.status).toBe(200);
    expect(consultas).toEqual([]);
  });

  it("sin configurar responde 503 para que Mercado Pago reintente después", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");
    expect((await POST(aviso())).status).toBe(503);
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO);
    admin.cliente = null;
    expect((await POST(aviso())).status).toBe(503);
  });

  it("si Mercado Pago falla responde 502 (reintenta); si el pago no existe, 200", async () => {
    pagoMp.status = 500;
    expect((await POST(aviso())).status).toBe(502);
    pagoMp.status = 404;
    expect((await POST(aviso())).status).toBe(200);
    expect(await base.saldo(ANA)).toBe(0);
  });

  it("un id de pago con formato raro no llega a la URL de Mercado Pago", async () => {
    const r = await POST(aviso({ dataId: "../users" }));
    expect(r.status).toBe(200);
    expect(consultas).toEqual([]);
  });

  it("si la base falla responde 500 para que reintente; si la cuenta ya no existe, 200", async () => {
    admin.cliente = { rpc: async () => ({ data: null, error: { message: "connection refused" } }) };
    expect((await POST(aviso())).status).toBe(500);

    admin.cliente = base.db;
    await base.pg.exec(`reset role; delete from auth.users where id = '${ANA}';`);
    const r = await POST(aviso());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ignorado: "revisar a mano" });
  });
});
