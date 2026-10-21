import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canvasABlob,
  descargarCanvas,
  nombreSeguroDescarga,
  type CanvasMinimo,
  type DocumentoMinimo,
  type EnlaceMinimo,
} from "../lib/descargaTarjeta.ts";
import { nombreArchivoTarjeta } from "../lib/desenlace.ts";

const PNG = "data:image/png;base64," + "A".repeat(80);

function simulado() {
  const eventos: string[] = [];
  let enlace!: EnlaceMinimo;
  const doc: DocumentoMinimo = {
    createElement: () => {
      enlace = {
        href: "",
        download: "",
        style: { display: "" },
        click: () => eventos.push("click"),
        remove: () => eventos.push("remove"),
      };
      return enlace;
    },
    body: { appendChild: () => eventos.push("append") },
  };
  const api = { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() };
  return { doc, api, eventos, enlace: () => enlace };
}

afterEach(() => vi.useRealTimers());

describe("descargarCanvas", () => {
  it("agrega el enlace al documento antes del clic y lo quita después", async () => {
    const s = simulado();
    const canvas: CanvasMinimo = { toBlob: (cb) => cb(new Blob(["x"])), toDataURL: () => PNG };
    const r = await descargarCanvas(canvas, "a.png", s.doc, s.api);
    expect(r.ok).toBe(true);
    expect(s.eventos).toEqual(["append", "click", "remove"]);
    expect(s.enlace().href).toBe("blob:x");
    expect(s.enlace().download).toBe("a.png");
  });

  it("no revoca la URL enseguida", async () => {
    vi.useFakeTimers();
    const s = simulado();
    const canvas: CanvasMinimo = { toBlob: (cb) => cb(new Blob(["x"])), toDataURL: () => PNG };
    await descargarCanvas(canvas, "a.png", s.doc, s.api);
    vi.advanceTimersByTime(1500);
    expect(s.api.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(s.api.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("si toBlob devuelve null usa toDataURL", async () => {
    const s = simulado();
    const canvas: CanvasMinimo = { toBlob: (cb) => cb(null), toDataURL: () => PNG };
    const r = await descargarCanvas(canvas, "a.png", s.doc, s.api);
    expect(r.ok).toBe(true);
    expect(s.enlace().href).toBe(PNG);
    expect(s.api.createObjectURL).not.toHaveBeenCalled();
  });

  it("canvas contaminado: avisa en vez de callar", async () => {
    const s = simulado();
    const boom = () => {
      throw new Error("SecurityError");
    };
    const r = await descargarCanvas({ toBlob: boom, toDataURL: boom }, "a.png", s.doc, s.api);
    expect(r.ok).toBe(false);
    expect(s.eventos).toEqual([]);
  });

  it("sin canvas devuelve error", async () => {
    expect((await descargarCanvas(null, "a.png")).ok).toBe(false);
  });

  it("si el DOM falla devuelve error, no lanza", async () => {
    const s = simulado();
    s.doc.body.appendChild = () => {
      throw new Error("x");
    };
    const canvas: CanvasMinimo = { toBlob: (cb) => cb(new Blob(["x"])), toDataURL: () => PNG };
    expect((await descargarCanvas(canvas, "a.png", s.doc, s.api)).ok).toBe(false);
  });
});

describe("canvasABlob", () => {
  it("devuelve null si toBlob nunca responde", async () => {
    vi.useFakeTimers();
    const p = canvasABlob({ toBlob: () => {}, toDataURL: () => "" }, 1000);
    vi.advanceTimersByTime(1000);
    expect(await p).toBeNull();
  });
});

describe("nombres de archivo", () => {
  it("nombreSeguroDescarga quita caracteres prohibidos", () => {
    expect(nombreSeguroDescarga("a/b:c*d?.png")).toBe("a-b-c-d-.png");
    expect(nombreSeguroDescarga("")).toBe("tarjeta.png");
  });
  it("nombreArchivoTarjeta sale seguro con temas raros", () => {
    for (const t of ['¿Compro el 🍕 /\\:*?"<>|?', "", "ñandú  ".repeat(20), "...."]) {
      const n = nombreArchivoTarjeta(t);
      expect(n).toMatch(/^[a-z0-9-]+\.png$/);
      expect(nombreSeguroDescarga(n)).toBe(n);
    }
  });
});
