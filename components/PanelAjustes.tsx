"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface PanelAjustesProps {
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
}

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Panel lateral de Ajustes (modo de juego, keys, cuenta). Se abre desde la derecha sobre el
 * inicio; Esc, el fondo o la X lo cierran y el foco vuelve al botón que lo abrió.
 * El contenido de detrás queda `inert` desde ConfigPanel mientras está abierto.
 */
export default function PanelAjustes({ abierto, onCerrar, children }: PanelAjustesProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>(ENFOCABLES)?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCerrar();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // El foco da la vuelta dentro del panel.
      const lista = [...panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
      if (lista.length === 0) return;
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, [abierto, onCerrar]);

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
        <div className="ajustes-cuerpo">{children}</div>
      </div>
    </div>
  );
}
