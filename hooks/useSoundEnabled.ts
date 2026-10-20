"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "sound-enabled";

/**
 * Suscribe a cambios en localStorage (simulado con storage events).
 */
function subscribe(callback: () => void) {
  const handleStorage = () => callback();
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

/**
 * Obtiene el valor actual de sound-enabled desde localStorage.
 */
function getSnapshot(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

/**
 * Valor por defecto para SSR (asume sonido habilitado).
 */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Hook que lee la preferencia de sonido desde localStorage de forma segura.
 * Evita errores de hidratación usando useSyncExternalStore.
 */
export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Establece la preferencia de sonido en localStorage.
 */
export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    // Trigger storage event para actualizar otros tabs/ventanas
    window.dispatchEvent(new Event("storage"));
  } catch {
    // Ignorar errores de localStorage
  }
}
