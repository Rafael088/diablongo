// v0.4.0: GET /api/retos (Mis retos) y la lógica de crear/compartir un reto en el navegador.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AVISO_LINK_COPIADO, compartirReto, crearRetoCliente, TEXTO_COMPARTIR } from "@/lib/compartirReto";

vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));
const cuentas = vi.hoisted(() => ({ usuario: null as string | null, admin: null as unknown, servidor: true }));
vi.mock("@/lib/supabase/servidor", () => ({
  clienteServidor: async () =>
    cuentas.servidor
      ? { auth: { getUser: async () => ({ data: { user: cuentas.usuario ? { id: cuentas.usuario } : null }, error: null }) } }
      : null,
}));
vi.mock("@/lib/supabase/admin", () => ({ clienteAdmin: () => cuentas.admin }));

import { GET } from "@/app/api/retos/route";
import MisRetos from "@/components/MisRetos";

const FILA = {
  id: "RetoPrueba",
  tema: "¿Rines o tarjeta?",
  personalidad_pro: "clasica-pro",
  personalidad_con: "clasica-con",
  eleccion: "con",
  creado_en: "2026-10-23T10:00:00Z",
  votos_pro: 2,
  votos_con: 5,
};

beforeEach(() => {
  cuentas.usuario = null;
  cuentas.servidor = true;
  cuentas.admin = { rpc: vi.fn(async () => ({ data: [FILA], error: null })) };
});

describe("GET /api/retos", () => {
  it("sin sesión da 401", async () => {
    expect((await GET()).status).toBe(401);
  });
  it("sin Supabase da 503", async () => {
    cuentas.servidor = false;
    expect((await GET()).status).toBe(503);
  });
  it("lista los retos de la sesión", async () => {
    cuentas.usuario = "ana";
    const r = await GET();
    expect(r.status).toBe(200);
    const { retos } = await r.json();
    expect(retos).toHaveLength(1);
    expect(retos[0]).toMatchObject({ id: "RetoPrueba", tema: "¿Rines o tarjeta?", eleccion: "con", votos: { pro: 2, con: 5 } });
    expect(retos[0].frases).toBeUndefined();
    expect((cuentas.admin as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("retos_de_usuario", { p_usuario: "ana", p_limite: 50 });
  });
  it("si la base falla da 503", async () => {
    cuentas.usuario = "ana";
    cuentas.admin = { rpc: async () => ({ data: null, error: { message: "x" } }) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET()).status).toBe(503);
  });
});

describe("compartirReto", () => {
  const ruta = "/r/RetoPrueba";
  it("con share abre compartir con url absoluta", async () => {
    const share = vi.fn(async () => {});
    const copiar = vi.fn(async () => {});
    expect(await compartirReto(ruta, { origen: "https://d.app", share, copiar })).toBe("compartido");
    expect(share).toHaveBeenCalledWith({ title: expect.any(String), text: TEXTO_COMPARTIR, url: "https://d.app/r/RetoPrueba" });
    expect(copiar).not.toHaveBeenCalled();
  });
  it("sin share copia el link", async () => {
    const copiar = vi.fn(async () => {});
    expect(await compartirReto(ruta, { origen: "https://d.app", copiar })).toBe("copiado");
    expect(copiar).toHaveBeenCalledWith("https://d.app/r/RetoPrueba");
    expect(AVISO_LINK_COPIADO).toBe("Link copiado");
  });
  it("AbortError no copia nada", async () => {
    const copiar = vi.fn(async () => {});
    const share = async () => {
      throw new DOMException("cancelado", "AbortError");
    };
    expect(await compartirReto(ruta, { origen: "https://d.app", share, copiar })).toBe("cancelado");
    expect(copiar).not.toHaveBeenCalled();
  });
  it("otro error de share cae a copiar; sin nada, falla", async () => {
    const copiar = vi.fn(async () => {});
    const share = async () => {
      throw new Error("NotAllowedError");
    };
    expect(await compartirReto(ruta, { origen: "https://d.app", share, copiar })).toBe("copiado");
    expect(await compartirReto(ruta, { origen: "https://d.app", share })).toBe("fallo");
  });
});

describe("crearRetoCliente", () => {
  const DEBATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const resp = (status: number, cuerpo: unknown) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));
  it("manda el cuerpo exacto y entiende 201", async () => {
    const f = resp(201, { id: "RetoPrueba", creado: true, ruta: "/r/RetoPrueba" });
    expect(await crearRetoCliente(DEBATE, "pro", f as unknown as typeof fetch)).toEqual({ ok: true, id: "RetoPrueba", ruta: "/r/RetoPrueba", creado: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/retos");
    expect(JSON.parse(init.body as string)).toEqual({ debate: DEBATE, eleccion: "pro" });
  });
  it("200 es un reto que ya existía", async () => {
    const r = await crearRetoCliente(DEBATE, "con", resp(200, { id: "X1234567890", creado: false, ruta: "/r/X1234567890" }) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, creado: false });
  });
  it.each([401, 403, 409, 503, 500])("error %i da mensaje", async (estado) => {
    const r = await crearRetoCliente(DEBATE, "pro", resp(estado, {}) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });
  it("usa el error del servidor y sobrevive a la red caída", async () => {
    expect(await crearRetoCliente(DEBATE, "pro", resp(409, { error: "Mensaje del servidor" }) as unknown as typeof fetch)).toEqual({ ok: false, error: "Mensaje del servidor" });
    const r = await crearRetoCliente(DEBATE, "pro", (async () => { throw new Error("red"); }) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });
});

describe("MisRetos", () => {
  it("antes de cargar no pinta nada", () => {
    expect(renderToStaticMarkup(createElement(MisRetos))).toBe("");
  });
});
