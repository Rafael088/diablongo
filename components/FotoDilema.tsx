"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageUp, RefreshCw, X } from "lucide-react";
import { useDialogo } from "@/hooks/useDialogo";

// Lado mayor de la foto que se manda y calidad JPEG: ~150-300 KB, de sobra para que el modelo la vea.
const LADO_MAX = 1024;
const CALIDAD = 0.82;
// Por debajo del tope del servidor (MAX_FOTO_BYTES = 1 MB decodificado ≈ 1,37 M de base64).
const MAX_DATA_URL = 1_300_000;

interface FotoDilemaProps {
  foto: string | null;
  onChange: (foto: string | null) => void;
}

/**
 * Foto del dilema (solo con créditos). «Tomar foto» abre la cámara: en el celular, la del sistema
 * (input con `capture`); en el computador, la webcam dentro de un diálogo. «Subir foto» abre el
 * selector de archivos. La foto se reduce en el navegador antes de salir (lib/foto.ts la valida).
 */
export default function FotoDilema({ foto, onChange }: FotoDilemaProps) {
  const archivo = useRef<HTMLInputElement>(null);
  const camaraNativa = useRef<HTMLInputElement>(null);
  const [webcam, setWebcam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const usar = async (fuente: Blob | HTMLCanvasElement) => {
    setError(null);
    setTrabajando(true);
    try {
      onChange(await reducir(fuente));
    } catch {
      setError("No pudimos leer esa imagen. Prueba con una JPG o PNG.");
    } finally {
      setTrabajando(false);
    }
  };

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Eso no es una imagen.");
      return;
    }
    void usar(f);
  };

  const tomarFoto = () => {
    setError(null);
    // Pantalla táctil o sin getUserMedia: la cámara del sistema es mejor que un <video>.
    const tactil = window.matchMedia("(pointer: coarse)").matches;
    if (tactil || !navigator.mediaDevices?.getUserMedia) camaraNativa.current?.click();
    else setWebcam(true);
  };

  const cerrarWebcam = useCallback(() => setWebcam(false), []);

  return (
    <div className="foto">
      <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={alElegir} />
      <input ref={camaraNativa} type="file" accept="image/*" capture="environment" hidden onChange={alElegir} />

      {foto ? (
        <div className="foto-elegida">
          {/* Data URL local: next/image no aporta nada aquí. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="Tu foto del dilema" className="foto-miniatura" />
          <div className="foto-elegida-texto">
            <p className="foto-titulo">El Ángel y el Diablo van a ver esta foto.</p>
            <div className="foto-acciones">
              <button type="button" className="foto-enlace" onClick={tomarFoto}>
                <RefreshCw className="w-4 h-4" aria-hidden />
                Cambiar
              </button>
              <button type="button" className="foto-enlace" onClick={() => onChange(null)}>
                <X className="w-4 h-4" aria-hidden />
                Quitar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="foto-vacia">
          <p className="foto-titulo">¿Tienes una foto? Que la vean.</p>
          <div className="foto-botones">
            <button type="button" className="foto-boton" onClick={tomarFoto} disabled={trabajando}>
              <Camera className="w-5 h-5" aria-hidden />
              Tomar foto
            </button>
            <button type="button" className="foto-boton" onClick={() => archivo.current?.click()} disabled={trabajando}>
              <ImageUp className="w-5 h-5" aria-hidden />
              {trabajando ? "Preparando…" : "Subir foto"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="inicio-alerta" role="alert">
          {error}
        </p>
      )}

      {webcam &&
        createPortal(
          <Webcam
            onCerrar={cerrarWebcam}
            onFoto={(lienzo) => {
              setWebcam(false);
              void usar(lienzo);
            }}
            onSubir={() => {
              setWebcam(false);
              archivo.current?.click();
            }}
          />,
          document.body
        )}
    </div>
  );
}

/** Diálogo con la webcam (computador). Apaga la cámara al cerrarse, pase lo que pase. */
function Webcam(props: { onCerrar: () => void; onFoto: (lienzo: HTMLCanvasElement) => void; onSubir: () => void }) {
  const { onCerrar, onFoto, onSubir } = props;
  const caja = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<"abriendo" | "lista" | "error">("abriendo");
  useDialogo(caja, true, onCerrar);

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let vivo = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })
      .then((f) => {
        if (!vivo) {
          f.getTracks().forEach((t) => t.stop());
          return;
        }
        flujo = f;
        if (video.current) video.current.srcObject = f;
        setEstado("lista");
      })
      .catch(() => {
        if (vivo) setEstado("error");
      });
    return () => {
      vivo = false;
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capturar = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const lienzo = document.createElement("canvas");
    lienzo.width = v.videoWidth;
    lienzo.height = v.videoHeight;
    lienzo.getContext("2d")?.drawImage(v, 0, 0);
    onFoto(lienzo);
  };

  return (
    <div className="ajustes-capa camara-capa">
      <div className="ajustes-fondo" onClick={onCerrar} aria-hidden />
      <div ref={caja} className="camara" role="dialog" aria-modal="true" aria-labelledby="camara-titulo">
        <div className="ajustes-cabecera">
          <h2 id="camara-titulo" className="ajustes-titulo">Tomar foto</h2>
          <button type="button" className="ajustes-cerrar" onClick={onCerrar} aria-label="Cerrar la cámara">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="camara-visor">
          <video ref={video} autoPlay playsInline muted className="camara-video" data-lista={estado === "lista"} />
          {estado === "abriendo" && <p className="camara-mensaje">Abriendo la cámara…</p>}
          {estado === "error" && (
            <p className="camara-mensaje" role="alert">
              No pudimos abrir la cámara. Revisa el permiso del navegador o sube una foto.
            </p>
          )}
        </div>
        <div className="ajustes-pie">
          <button type="button" className="ajustes-pie-enlace" onClick={onSubir}>
            Subir una foto
          </button>
          <button type="button" className="ajustes-listo" onClick={capturar} disabled={estado !== "lista"}>
            <Camera className="w-5 h-5" aria-hidden />
            Tomar foto
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reduce la imagen a LADO_MAX y la pasa a JPEG; baja la calidad si aún pesa demasiado. */
async function reducir(fuente: Blob | HTMLCanvasElement): Promise<string> {
  const img = fuente instanceof Blob ? await createImageBitmap(fuente) : fuente;
  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  // Fondo noche por si la imagen trae transparencia (JPEG no la tiene).
  ctx.fillStyle = "#0F0E17";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  if ("close" in img) img.close();
  for (const calidad of [CALIDAD, 0.7, 0.55]) {
    const url = lienzo.toDataURL("image/jpeg", calidad);
    if (url.length <= MAX_DATA_URL) return url;
  }
  throw new Error("muy pesada");
}
