// Desenlace de la tarjeta final: limpieza del texto del modelo, plantilla
// local de respaldo y utilidades de la tarjeta. Módulo puro, sin React.
import { MAX_WORDS_DESENLACE } from "./prompts.ts";

/** Nombre de marca provisional de la tarjeta; se decide en otra tarea. */
export const MARCA_TARJETA = "Diablongo";

/** Si el modelo tarda más que esto se usa la plantilla local. */
export const TIEMPO_MAX_DESENLACE_MS = 8000;

export type Bando = "pro" | "con";

export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Quita comillas y saltos, y recorta a MAX_WORDS_DESENLACE palabras. */
export function limpiarDesenlace(texto: string): string {
  const limpio = texto.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  const palabras = limpio.split(" ").filter(Boolean);
  if (palabras.length <= MAX_WORDS_DESENLACE) return limpio;
  return palabras.slice(0, MAX_WORDS_DESENLACE).join(" ").replace(/[,;:]$/, "") + "...";
}

/** Tema sin signos de pregunta y recortado, para meterlo en una frase. */
export function temaCorto(tema: string, max = 48): string {
  const t = tema.replace(/[¿?¡!]/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "...";
}

const PLANTILLAS: Record<Bando, readonly ((t: string) => string)[]> = {
  pro: [
    (t) => `Elegiste al Angelito: «${t}» salió bien. Tu yo del futuro te aplaude.`,
    (t) => `Elegiste al Angelito: sobre «${t}», cabeza fría y bolsillo contento.`,
    (t) => `Elegiste al Angelito: «${t}» queda resuelto. Dormirás tranquilo, aburrido pero tranquilo.`,
  ],
  con: [
    (t) => `Elegiste al Diablito: «${t}» ganó. Tu bolsillo llora.`,
    (t) => `Elegiste al Diablito: sobre «${t}», cero remordimientos hoy y muchos mañana.`,
    (t) => `Elegiste al Diablito: «${t}» ya está hecho. Tu yo del futuro pide explicaciones.`,
  ],
};

/** Plantilla local según quién ganó (el elegido), con el tema metido. */
export function plantillaDesenlace(tema: string, ganador: Bando): string {
  const opciones = PLANTILLAS[ganador];
  let h = 0;
  for (const c of tema) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return opciones[h % opciones.length](temaCorto(tema) || "tu decisión");
}

/** Nombre de archivo seguro para la tarjeta, a partir del tema. */
export function nombreArchivoTarjeta(tema: string): string {
  const base = tema
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${MARCA_TARJETA.toLowerCase().replace(/\s+/g, "-")}-${base || "desenlace"}.png`;
}
