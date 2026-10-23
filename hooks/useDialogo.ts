"use client";

import { useEffect, type RefObject } from "react";

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento de diálogo modal: bloquea el scroll de la página, enfoca el primer control,
 * atrapa el foco con Tab, cierra con Esc y devuelve el foco a quien lo abrió.
 * Quien lo usa pone `inert` al contenido de detrás.
 */
export function useDialogo(caja: RefObject<HTMLElement | null>, abierto: boolean, onCerrar: () => void) {
  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    caja.current?.querySelector<HTMLElement>(ENFOCABLES)?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCerrar();
        return;
      }
      if (e.key !== "Tab" || !caja.current) return;
      // El foco da la vuelta dentro del diálogo.
      const lista = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
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
  }, [abierto, onCerrar, caja]);
}
