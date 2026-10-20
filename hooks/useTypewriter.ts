"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Milisegundos por letra (velocidad fija). */
export const MS_POR_LETRA = 30;

const CONSULTA = "(prefers-reduced-motion: reduce)";

function suscribir(cb: () => void) {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false
  );
}

/**
 * Texto letra por letra. Con movimiento reducido (o `instant`) sale completo.
 * `skip` lo completa al instante.
 */
export function useTypewriter(text: string, instant = false) {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ text, count: 0 });
  // Si el texto cambió, se empieza de cero sin necesidad de un efecto.
  const count = state.text === text ? state.count : 0;
  const done = instant || reduced || count >= text.length;

  useEffect(() => {
    if (instant || reduced || text.length === 0) return;
    const id = setInterval(() => {
      setState((s) => {
        const base = s.text === text ? s.count : 0;
        if (s.text === text && base >= text.length) return s;
        return { text, count: Math.min(text.length, base + 1) };
      });
    }, MS_POR_LETRA);
    return () => clearInterval(id);
  }, [text, instant, reduced]);

  const skip = useCallback(() => setState({ text, count: text.length }), [text]);

  return { shown: done ? text : text.slice(0, count), count, done, skip };
}
