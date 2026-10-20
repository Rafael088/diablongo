"use client";

import { useSyncExternalStore } from "react";
import { crearLectorCacheado, sumar, MARCADOR_INICIAL } from "@/lib/marcador";
import type { Bando, Marcador } from "@/lib/marcador";

const STORAGE_KEY = "marcador-angel-diablo";

const leerCacheado = crearLectorCacheado();

/**
 * Suscribe a cambios en localStorage (simulado con storage events).
 */
function subscribe(callback: () => void) {
  const handleStorage = () => callback();
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

/**
 * Obtiene el valor actual del marcador desde localStorage.
 */
function getSnapshot(): Marcador {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return leerCacheado(stored);
  } catch {
    return MARCADOR_INICIAL;
  }
}

/**
 * Valor por defecto para SSR (marcador inicial).
 */
function getServerSnapshot(): Marcador {
  return MARCADOR_INICIAL;
}

/**
 * Hook que lee el marcador desde localStorage de forma segura.
 * Evita errores de hidratación usando useSyncExternalStore.
 */
export function useMarcador(): Marcador {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Suma una victoria al marcador y lo guarda en localStorage.
 */
export function sumarMarcador(quien: Bando): void {
  try {
    const actual = getSnapshot();
    const nuevo = sumar(actual, quien);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevo));
    // Trigger storage event para actualizar otros tabs/ventanas
    window.dispatchEvent(new Event("storage"));
  } catch {
    // Ignorar errores de localStorage
  }
}

/**
 * Borra el marcador de localStorage.
 */
export function borrarMarcador(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Trigger storage event
    window.dispatchEvent(new Event("storage"));
  } catch {
    // Ignorar errores de localStorage
  }
}
