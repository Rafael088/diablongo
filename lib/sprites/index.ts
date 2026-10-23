// Sprites en pixel art de Agent Debate, dibujados en código.
import { ANGEL } from "./angel.ts";
import { DIABLO } from "./diablo.ts";
import { USUARIO } from "./usuario.ts";
import { PALETA_SPRITES, TRANSPARENTE } from "./paleta.ts";
import { matrizVariante } from "./variantes.ts";
import type {
  FotogramaDebatiente,
  FotogramaSprite,
  FotogramaUsuario,
  MatrizSprite,
  PersonajeSprite,
} from "./tipos.ts";

export { PALETA_SPRITES, TRANSPARENTE };
export { matrizVariante, tieneVariante, idsConVariante, VARIANTES } from "./variantes.ts";
export type { CaracterPaleta } from "./paleta.ts";
export type {
  FotogramaDebatiente,
  FotogramaSprite,
  FotogramaUsuario,
  MatrizSprite,
  PersonajeSprite,
};

/** Lado de cada sprite en píxeles. */
export const TAMANO_SPRITE = 32;

export const SPRITES: {
  pro: Record<FotogramaDebatiente, MatrizSprite>;
  con: Record<FotogramaDebatiente, MatrizSprite>;
  usuario: Record<FotogramaUsuario, MatrizSprite>;
} = { pro: ANGEL, con: DIABLO, usuario: USUARIO };

export const NOMBRE_PERSONAJE: Record<PersonajeSprite, string> = {
  pro: "Ángel",
  con: "Diablo",
  usuario: "Usuario",
};

/** Fotogramas disponibles para un personaje, en orden. */
export function fotogramasDe(personaje: PersonajeSprite): FotogramaSprite[] {
  return Object.keys(SPRITES[personaje]) as FotogramaSprite[];
}

/** Matriz de un personaje y fotograma; si el fotograma no existe, usa "reposo". */
export function matrizDe(
  personaje: PersonajeSprite,
  fotograma: FotogramaSprite,
  /** Id de personalidad (lib/personalidades.ts): pinta su variante sobre el sprite base. Solo Ángel y Diablo. */
  personalidad?: string,
): MatrizSprite {
  if (personalidad && personaje !== "usuario" && fotograma !== "pensar" && fotograma !== "decidir") {
    return matrizVariante(personaje, personalidad, fotograma);
  }
  const frames = SPRITES[personaje] as Record<string, MatrizSprite>;
  return frames[fotograma] ?? frames.reposo;
}

export interface RectSprite {
  x: number;
  y: number;
  ancho: number;
  color: string;
}

/**
 * Convierte una matriz en rectángulos de 1 px de alto: une los píxeles
 * contiguos del mismo color de cada fila para no pintar 1024 nodos.
 */
export function rectsDeMatriz(matriz: MatrizSprite): RectSprite[] {
  const paleta: Record<string, string> = PALETA_SPRITES;
  const rects: RectSprite[] = [];
  matriz.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      const c = fila[x];
      let fin = x + 1;
      while (fin < fila.length && fila[fin] === c) fin++;
      if (c !== TRANSPARENTE && paleta[c]) {
        rects.push({ x, y, ancho: fin - x, color: paleta[c] });
      }
      x = fin;
    }
  });
  return rects;
}

/** SVG en texto (para scripts y capturas sin React). */
export function svgDeMatriz(matriz: MatrizSprite, escala = 1): string {
  const lado = TAMANO_SPRITE * escala;
  const cuerpo = rectsDeMatriz(matriz)
    .map(
      (r) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.ancho}" height="1" fill="${r.color}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${TAMANO_SPRITE} ${TAMANO_SPRITE}" shape-rendering="crispEdges">${cuerpo}</svg>`;
}
