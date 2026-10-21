"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MARCA_TARJETA, nombreArchivoTarjeta, temaCorto, type Bando } from "@/lib/desenlace";
import {
  MENSAJE_ERROR_COMPARTIR,
  MENSAJE_ERROR_DESCARGA,
  canvasABlob,
  descargarCanvas,
} from "@/lib/descargaTarjeta";
import { TOKENS } from "@/lib/paleta";
import { TAMANO_SPRITE, matrizDe, rectsDeMatriz } from "@/lib/sprites";

export const TARJETA_ANCHO = 1080;
export const TARJETA_ALTO = 1350;
const C = TOKENS;
const TEXTO_FALLO = "ui-monospace, monospace";

/** Familias de las fuentes de next/font (variables CSS del <html>) para pintar en el canvas. */
interface Fuentes {
  titulo: string;
  dialogo: string;
}
function leerFuentes(): Fuentes {
  const estilo = getComputedStyle(document.documentElement);
  const familia = (v: string) => {
    const valor = estilo.getPropertyValue(v).trim();
    return valor ? `${valor}, ${TEXTO_FALLO}` : TEXTO_FALLO;
  };
  return { titulo: familia("--font-titulo"), dialogo: familia("--font-dialogo") };
}

/** Espera a que las dos fuentes estén cargadas con todos los glifos que va a usar la tarjeta. */
async function cargarFuentes(f: Fuentes, textos: string[]): Promise<void> {
  const muestra = textos.join(" ");
  try {
    await Promise.all([
      document.fonts.load(`20px ${f.titulo}`, muestra),
      document.fonts.load(`20px ${f.dialogo}`, muestra),
    ]);
  } catch {
    // sin fuentes se pinta con el fallback monoespaciado
  }
}

const ACENTO: Record<Bando, string> = { pro: C["--color-angel"], con: C["--color-diablo"] };
const ETIQUETA: Record<Bando, string> = { pro: "Ganó el Ángel", con: "Ganó el Diablo" };

/** Parte el texto en líneas que caben en `ancho` píxeles. */
function envolver(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && ctx.measureText(prueba).width > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function pintarTarjeta(
  canvas: HTMLCanvasElement,
  f: Fuentes,
  tema: string, desenlace: string,
  ganador: Bando,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const acento = ACENTO[ganador];
  const centro = TARJETA_ANCHO / 2;

  ctx.fillStyle = C["--color-superficie"];
  ctx.fillRect(0, 0, TARJETA_ANCHO, TARJETA_ALTO);
  // Borde blanco grueso estilo Undertale.
  ctx.strokeStyle = C["--color-borde"];
  ctx.lineWidth = 20;
  ctx.strokeRect(50, 50, TARJETA_ANCHO - 100, TARJETA_ALTO - 100);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Tema del usuario.
  ctx.fillStyle = C["--color-texto-suave"];
  ctx.font = `26px ${f.titulo}`;
  ctx.fillText("* TU DECISIÓN", centro, 150);
  ctx.fillStyle = C["--color-texto"];
  ctx.font = `50px ${f.dialogo}`;
  const lineasTema = envolver(ctx, `«${temaCorto(tema, 90)}»`, 840).slice(0, 3);
  lineasTema.forEach((l, i) => ctx.fillText(l, centro, 215 + i * 58));

  // Sprite ganador en victoria, píxel a píxel y nítido.
  const escala = 18;
  const lado = TAMANO_SPRITE * escala;
  const x0 = centro - lado / 2;
  const y0 = 375;
  ctx.fillStyle = C["--color-fondo"];
  ctx.fillRect(x0 - 20, y0 - 20, lado + 40, lado + 40);
  ctx.strokeStyle = acento;
  ctx.lineWidth = 8;
  ctx.strokeRect(x0 - 20, y0 - 20, lado + 40, lado + 40);
  ctx.imageSmoothingEnabled = false;
  for (const r of rectsDeMatriz(matrizDe(ganador, "victoria"))) {
    ctx.fillStyle = r.color;
    ctx.fillRect(x0 + r.x * escala, y0 + r.y * escala, r.ancho * escala, escala);
  }

  // Quién ganó y el desenlace.
  ctx.fillStyle = acento;
  ctx.font = `38px ${f.titulo}`;
  ctx.fillText(ETIQUETA[ganador].toUpperCase(), centro, 1045);
  ctx.fillStyle = C["--color-texto"];
  ctx.font = `46px ${f.dialogo}`;
  const lineas = envolver(ctx, desenlace, 840).slice(0, 4);
  lineas.forEach((l, i) => ctx.fillText(l, centro, 1115 + i * 54));

  // Marca provisional.
  ctx.fillStyle = C["--color-texto-suave"];
  ctx.font = `22px ${f.titulo}`;
  ctx.fillText(MARCA_TARJETA, centro, 1278);
}

const sinSuscripcion = () => () => {};
function puedeCompartirArchivos(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  try {
    const prueba = new File([""], "a.png", { type: "image/png" });
    return navigator.canShare?.({ files: [prueba] }) ?? false;
  } catch {
    return false;
  }
}

interface TarjetaDesenlaceProps {
  tema: string;
  desenlace: string;
  ganador: Bando;
  onJugarOtra: () => void;
  /** Capturas: escribe el PNG real en un <output> para sacarlo con --dump-dom. */
  volcado?: boolean;
}

export default function TarjetaDesenlace({
  tema,
  desenlace,
  ganador,
  onJugarOtra,
  volcado = false,
}: TarjetaDesenlaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const volcadoRef = useRef<HTMLOutputElement>(null);
  const compartir = useSyncExternalStore(sinSuscripcion, puedeCompartirArchivos, () => false);
  const [lista, setLista] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let vigente = true;
    setLista(false);
    setError(null);
    const fuentes = leerFuentes();
    // Hasta que las fuentes carguen no se pinta: así el PNG nunca sale con la tipografía de reserva.
    void cargarFuentes(fuentes, [tema, desenlace, ETIQUETA[ganador], MARCA_TARJETA, "* TU DECISIÓN"]).then(() => {
      if (!vigente) return;
      pintarTarjeta(canvas, fuentes, tema, desenlace, ganador);
      if (volcado && volcadoRef.current) volcadoRef.current.textContent = canvas.toDataURL("image/png");
      setLista(true);
    });
    return () => {
      vigente = false;
    };
  }, [tema, desenlace, ganador, volcado]);

  const descargar = async () => {
    setError(null);
    const r = await descargarCanvas(canvasRef.current, nombreArchivoTarjeta(tema));
    if (!r.ok) setError(MENSAJE_ERROR_DESCARGA);
  };

  const compartirTarjeta = async () => {
    setError(null);
    const canvas = canvasRef.current;
    const blob = canvas ? await canvasABlob(canvas) : null;
    if (!blob) {
      setError(MENSAJE_ERROR_COMPARTIR);
      return;
    }
    try {
      const archivo = new File([blob], nombreArchivoTarjeta(tema), { type: "image/png" });
      await navigator.share({ files: [archivo], title: MARCA_TARJETA, text: desenlace });
    } catch (e) {
      // AbortError: la persona cerró el menú de compartir; cualquier otro fallo se avisa.
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(MENSAJE_ERROR_COMPARTIR);
    }
  };

  return (
    <div className="tarjeta">
      <canvas
        ref={canvasRef}
        width={TARJETA_ANCHO}
        height={TARJETA_ALTO}
        className="tarjeta-canvas"
        role="img"
        aria-label={`Tarjeta de desenlace: ${desenlace}`}
      />
      <div className="caja-botones tarjeta-botones">
        <button type="button" className="caja-boton" onClick={descargar} disabled={!lista}>
          Descargar PNG
        </button>
        {compartir && (
          <button type="button" className="caja-boton" onClick={compartirTarjeta} disabled={!lista}>
            Compartir
          </button>
        )}
        <button type="button" className="caja-boton" onClick={onJugarOtra}>
          Jugar otra vez
        </button>
      </div>
      {error && (
        <p className="tarjeta-error" role="alert">
          {error}
        </p>
      )}
      {volcado && <output ref={volcadoRef} id="png-tarjeta" hidden />}
    </div>
  );
}
