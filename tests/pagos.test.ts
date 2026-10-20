import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PAQUETES, paquetePorId } from "@/lib/paquetes";
import { cuerpoPreferencia, interpretarVuelta, origenPublico, referenciaExterna } from "@/lib/pagos";

const sesion = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("@/lib/supabase/servidor", () => ({ clienteServidor: async () => sesion.cliente }));
import { POST } from "@/app/api/pagos/preferencia/route";

const conUsuario = (id: string | null) => ({
  auth: { getUser: async () => (id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: null }) },
});
const peticion = (cuerpo: unknown) =>
  new NextRequest("https://agent.test/api/pagos/preferencia", { method: "POST", body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });

describe("paquetes", () => {
  it("ids únicos, precios y créditos enteros positivos", () => {
    expect(new Set(PAQUETES.map((p) => p.id)).size).toBe(PAQUETES.length);
    for (const p of PAQUETES) {
      expect(Number.isInteger(p.precioCop) && p.precioCop > 0).toBe(true);
      expect(Number.isInteger(p.creditos) && p.creditos > 0).toBe(true);
    }
  });
  it("solo acepta ids conocidos", () => {
    expect(paquetePorId("basico")?.id).toBe("basico");
    for (const malo of ["nada", "", 5, null, undefined, {}, "__proto__", "constructor"]) expect(paquetePorId(malo)).toBeNull();
  });
});

describe("cuerpo de la preferencia", () => {
  const paquete = PAQUETES[1];
  const ref = referenciaExterna("u1", paquete.id, "abc");
  const cuerpo = cuerpoPreferencia({ paquete, usuarioId: "u1", referencia: ref, origen: "https://agent.test" });
  it("usa el precio del paquete en COP", () => {
    expect(cuerpo.items).toHaveLength(1);
    expect(cuerpo.items[0]).toMatchObject({ currency_id: "COP", unit_price: paquete.precioCop, quantity: 1 });
  });
  it("identifica usuario y paquete", () => {
    expect(ref).toBe(`u1:${paquete.id}:abc`);
    expect(cuerpo.external_reference).toBe(ref);
    expect(cuerpo.metadata).toEqual({ usuario_id: "u1", paquete: paquete.id, referencia: ref });
  });
  it("vuelta, auto_return y webhook", () => {
    expect(cuerpo.back_urls).toEqual({
      success: "https://agent.test/pagos/vuelta",
      failure: "https://agent.test/pagos/vuelta",
      pending: "https://agent.test/pagos/vuelta",
    });
    expect(cuerpo).toMatchObject({ auto_return: "approved", notification_url: "https://agent.test/api/pagos/webhook" });
  });
  it("sin https no pide auto_return", () => {
    const c = cuerpoPreferencia({ paquete, usuarioId: "u1", referencia: ref, origen: "http://localhost:3000" });
    expect("auto_return" in c).toBe(false);
  });
  it("origen público: variable primero, si no la petición", () => {
    expect(origenPublico("https://juego.co/", "http://x")).toBe("https://juego.co");
    expect(origenPublico("basura", "http://x/")).toBe("http://x");
    expect(origenPublico(undefined, "http://x")).toBe("http://x");
  });
});

describe("POST /api/pagos/preferencia", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "APP_USR-secreto-123");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    sesion.cliente = conUsuario("user-1");
    fetchMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sin sesión: 401 y no llama a Mercado Pago", async () => {
    sesion.cliente = conUsuario(null);
    expect((await POST(peticion({ paquete: "basico" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("paquete inválido o cuerpo roto: 400", async () => {
    expect((await POST(peticion({ paquete: "regalo" }))).status).toBe(400);
    expect((await POST(peticion("{no json"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sin token: 503", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "");
    const r = await POST(peticion({ paquete: "basico" }));
    expect(r.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("éxito: devuelve init_point y manda precio del servidor, token e idempotencia", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ init_point: "https://mp.test/pagar" }), { status: 201 }));
    // un precio colado por el cliente se ignora
    const r = await POST(peticion({ paquete: "pro", precio: 1, unit_price: 1 }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: "https://mp.test/pagar" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/checkout/preferences");
    expect(init.headers.Authorization).toBe("Bearer APP_USR-secreto-123");
    expect(init.headers["X-Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    const enviado = JSON.parse(init.body);
    expect(enviado.items[0].unit_price).toBe(paquetePorId("pro")!.precioCop);
    expect(enviado.external_reference).toMatch(/^user-1:pro:[0-9a-f-]{36}$/);
    expect(enviado.back_urls.success).toBe("https://agent.test/pagos/vuelta");
  });
  it("error de Mercado Pago: 502 sin filtrar el token", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Bearer APP_USR-secreto-123 inválido" }), { status: 401 }));
    const r = await POST(peticion({ paquete: "basico" }));
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("secreto-123");
    expect(JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("secreto-123");
  });
  it("fallo de red: 502", async () => {
    fetchMock.mockRejectedValue(new Error("red caída con APP_USR-secreto-123"));
    const r = await POST(peticion({ paquete: "basico" }));
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("secreto-123");
  });
});

describe("página de vuelta", () => {
  it("aprobado", () => {
    const r = interpretarVuelta({ status: "approved", payment_id: "123456" });
    expect(r).toMatchObject({ estado: "aprobado", pagoId: "123456" });
    expect(r.detalle).toContain("créditos aparecen en unos segundos");
  });
  it("usa collection_status si no hay status", () => {
    expect(interpretarVuelta({ collection_status: "approved" }).estado).toBe("aprobado");
  });
  it("pendiente (PSE) y rechazado", () => {
    expect(interpretarVuelta({ status: "pending" }).estado).toBe("pendiente");
    expect(interpretarVuelta({ status: "in_process" }).estado).toBe("pendiente");
    expect(interpretarVuelta({ status: "rejected" }).estado).toBe("rechazado");
  });
  it("desconocido y payment_id raro se ignora", () => {
    expect(interpretarVuelta({}).estado).toBe("desconocido");
    expect(interpretarVuelta({ status: ["approved", "x"], payment_id: "<script>" })).toMatchObject({ estado: "aprobado", pagoId: null });
  });
});
