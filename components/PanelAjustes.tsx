"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useDialogo } from "@/hooks/useDialogo";

interface PanelAjustesProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Columna izquierda: cómo jugar y la cuenta. */
  lateral: ReactNode;
  /** Lo propio del modo elegido. */
  children: ReactNode;
}

/**
 * Ajustes (modo de juego, keys, personalidades, cuenta). En escritorio es una ventana grande centrada
 * con dos columnas; en el celular ocupa toda la pantalla y las columnas se apilan. Esc, el fondo, la X
 * o «Listo» lo cierran y el foco vuelve al botón que lo abrió. El inicio queda `inert` detrás (ConfigPanel).
 */
export default function PanelAjustes({ abierto, onCerrar, lateral, children }: PanelAjustesProps) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogo(panel, abierto, onCerrar);

  if (!abierto) return null;
  return (
    <div className="ajustes-capa">
      <div className="ajustes-fondo" onClick={onCerrar} aria-hidden />
      <div ref={panel} className="ajustes-panel" role="dialog" aria-modal="true" aria-labelledby="ajustes-titulo">
        <div className="ajustes-cabecera">
          <h2 id="ajustes-titulo" className="ajustes-titulo">Ajustes</h2>
          <button type="button" className="ajustes-cerrar" onClick={onCerrar} aria-label="Cerrar ajustes">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="ajustes-cuerpo">
          <div className="ajustes-lateral">{lateral}</div>
          <div className="ajustes-detalle">{children}</div>
        </div>
        <div className="ajustes-pie">
          <Link href="/terminos" className="ajustes-pie-enlace">
            Términos y condiciones
          </Link>
          <button type="button" className="ajustes-listo" onClick={onCerrar}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
