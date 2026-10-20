"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { MARCA_TARJETA, nombreArchivoTarjeta, temaCorto, type Bando } from "@/lib/desenlace";
import { TAMANO_SPRITE, matrizDe, rectsDeMatriz } from "@/lib/sprites";

export const TARJETA_ANCHO = 1080;
export const TARJETA_ALTO = 1350;
const FUENTE = "ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";

const ACENTO: Record<Bando, string> = { pro: "#ffcc3a", con: "#e2483d" };
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

function pintarTarjeta(canvas: HTMLCanvasElement, tema: string, desenlace: string, ganador: Bando) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const acento = ACENTO[ganador];
  const centro = TARJETA_ANCHO / 2;

  ctx.fillStyle = "#0d0a14";
  ctx.fillRect(0, 0, TARJETA_ANCHO, TARJETA_ALTO);
  // Borde blanco grueso estilo Undertale.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 20;
  ctx.strokeRect(50, 50, TARJETA_ANCHO - 100, TARJETA_ALTO - 100);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Tema del usuario.
  ctx.fillStyle = "#a1a1aa";
  ctx.font = `34px ${FUENTE}`;
  ctx.fillText("* TU DECISIÓN", centro, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 46px ${FUENTE}`;
  const lineasTema = envolver(ctx, `«${temaCorto(tema, 90)}»`, 840).slice(0, 3);
  lineasTema.forEach((l, i) => ctx.fillText(l, centro, 215 + i * 58));

  // Sprite ganador en victoria, píxel a píxel y nítido.
  const escala = 18;
  const lado = TAMANO_SPRITE * escala;
  const x0 = centro - lado / 2;
  const y0 = 375;
  ctx.fillStyle = "#1b1026";
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
  ctx.font = `bold 44px ${FUENTE}`;
  ctx.fillText(ETIQUETA[ganador].toUpperCase(), centro, 1045);
  ctx.fillStyle = "#ffffff";
  ctx.font = `42px ${FUENTE}`;
  const lineas = envolver(ctx, desenlace, 840).slice(0, 4);
  lineas.forEach((l, i) => ctx.fillText(l, centro, 1110 + i * 52));

  // Marca provisional.
  ctx.fillStyle = "#71717a";
  ctx.font = `28px ${FUENTE}`;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pintarTarjeta(canvas, tema, desenlace, ganador);
    if (volcado && volcadoRef.current) volcadoRef.current.textContent = canvas.toDataURL("image/png");
  }, [tema, desenlace, ganador, volcado]);

  const aBlob = () =>
    new Promise<Blob | null>((resolver) => canvasRef.current?.toBlob(resolver, "image/png") ?? resolver(null));

  const descargar = async () => {
    const blob = await aBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivoTarjeta(tema);
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const compartirTarjeta = async () => {
    const blob = await aBlob();
    if (!blob) return;
    const archivo = new File([blob], nombreArchivoTarjeta(tema), { type: "image/png" });
    try {
      await navigator.share({ files: [archivo], title: MARCA_TARJETA, text: desenlace });
    } catch {
      // el usuario canceló el menú de compartir
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
        <button className="caja-boton" onClick={descargar}>
          Descargar PNG
        </button>
        {compartir && (
          <button className="caja-boton" onClick={compartirTarjeta}>
            Compartir
          </button>
        )}
        <button className="caja-boton" onClick={onJugarOtra}>
          Jugar otra vez
        </button>
      </div>
      {volcado && <output ref={volcadoRef} id="png-tarjeta" hidden />}
    </div>
  );
}
