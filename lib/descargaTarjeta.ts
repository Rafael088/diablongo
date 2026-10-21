// Descarga del PNG de la tarjeta. Módulo sin React y con el DOM inyectable para poder probarlo.

/** Lo mínimo que se usa de un canvas (permite simularlo en pruebas). */
export interface CanvasMinimo {
  toBlob(callback: (blob: Blob | null) => void, tipo?: string): void;
  toDataURL(tipo?: string): string;
}

export interface EnlaceMinimo {
  href: string;
  download: string;
  style?: { display: string };
  click(): void;
  remove(): void;
}
/** Lo mínimo que se usa del documento. */
export interface DocumentoMinimo {
  createElement(etiqueta: "a"): EnlaceMinimo;
  body: { appendChild(n: EnlaceMinimo): unknown };
}
export interface UrlMinimo {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export type ResultadoDescarga = { ok: true } | { ok: false; motivo: string };

export const MENSAJE_ERROR_DESCARGA =
  "No se pudo descargar la tarjeta. Mantén presionada la imagen para guardarla o usa Compartir.";
export const MENSAJE_ERROR_COMPARTIR =
  "No se pudo compartir la tarjeta. Mantén presionada la imagen para guardarla.";

const ESPERA_BLOB_MS = 10_000;
const ESPERA_REVOCAR_MS = 60_000;

/** PNG del canvas, o null si el navegador no lo da (toBlob nulo, lanza o no responde). */
export function canvasABlob(canvas: CanvasMinimo, espera = ESPERA_BLOB_MS): Promise<Blob | null> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => resolver(null), espera);
    const fin = (b: Blob | null) => {
      clearTimeout(temporizador);
      resolver(b);
    };
    try {
      canvas.toBlob(fin, "image/png");
    } catch {
      // canvas contaminado (SecurityError) o sin memoria
      fin(null);
    }
  });
}

/** Data URL del PNG, o null si el canvas no se puede leer. */
export function canvasADataUrl(canvas: CanvasMinimo): string | null {
  try {
    const url = canvas.toDataURL("image/png");
    return url.startsWith("data:image/png") && url.length > 64 ? url : null;
  } catch {
    return null;
  }
}

/** Nombre sin caracteres que el navegador rechace en `download`. */
export function nombreSeguroDescarga(nombre: string): string {
  const limpio = nombre.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+/, "").trim();
  return limpio || "tarjeta.png";
}

/** Baja el canvas como PNG: blob, y si no hay blob, data URL. Nunca lanza. */
export async function descargarCanvas(
  canvas: CanvasMinimo | null,
  nombre: string,
  doc?: DocumentoMinimo,
  api?: UrlMinimo,
): Promise<ResultadoDescarga> {
  if (!canvas) return { ok: false, motivo: "la tarjeta aún no está lista" };
  const d = doc ?? (document as unknown as DocumentoMinimo);
  const u = api ?? URL;
  try {
    const blob = await canvasABlob(canvas);
    let href: string | null;
    let urlObjeto: string | null = null;
    if (blob) {
      urlObjeto = u.createObjectURL(blob);
      href = urlObjeto;
    } else {
      href = canvasADataUrl(canvas);
    }
    if (!href) return { ok: false, motivo: "el navegador no dejó leer la imagen" };

    const enlace = d.createElement("a");
    enlace.href = href;
    enlace.download = nombreSeguroDescarga(nombre);
    if (enlace.style) enlace.style.display = "none";
    // Algunos navegadores ignoran el clic de un enlace que no está en el documento.
    d.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    if (urlObjeto) {
      const aRevocar = urlObjeto;
      // Revocar enseguida puede cortar la descarga: se deja un margen largo.
      setTimeout(() => u.revokeObjectURL(aRevocar), ESPERA_REVOCAR_MS);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "error desconocido" };
  }
}
