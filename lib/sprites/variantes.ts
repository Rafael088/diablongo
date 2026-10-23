// Variantes de personalidad (v0.4.0): el MISMO sprite base del Ángel / del Diablo con un cambio de
// paleta y una o dos capas de accesorios encima. No hay sprites nuevos desde cero: cada variante
// se calcula en el momento a partir de ANGEL / DIABLO, así las animaciones por estado
// (reposo, hablar, golpe, victoria) siguen siendo las de siempre.
//
// Los datos están indexados por el id de lib/personalidades.ts (ids estables). La clásica está
// vacía a propósito: devuelve la matriz base tal cual, idéntica a la de antes.
//
// Coordenadas: las de los fotogramas "reposo"/"hablar"/"victoria" (la cabeza y el torso están en el
// mismo sitio). En "golpe" el personaje se corre un píxel a la derecha: ver DESPLAZAMIENTO_GOLPE.
import type { DebateRole } from "../../types/index.ts";
import { ANGEL } from "./angel.ts";
import { DIABLO } from "./diablo.ts";
import type { FotogramaDebatiente, MatrizSprite } from "./tipos.ts";

/** x, y, ancho, alto, carácter de la paleta. */
type Rect = readonly [number, number, number, number, string];
type Zona = readonly [number, number, number, number];

/** Pinta encima de lo que haya (sombreros, gafas, corazón...). */
interface CapaPinta {
  rects: readonly Rect[];
}
/** Recolorea solo lo que ya hay dentro de las zonas (barba sobre la piel, corbata sobre la túnica...). */
interface CapaRecolor {
  zonas: readonly Zona[];
  mapa: Readonly<Record<string, string>>;
}
type Capa = CapaPinta | CapaRecolor;

export interface VarianteSprite {
  /** Cambio de paleta global: carácter del sprite base → carácter de la paleta. */
  paleta: Readonly<Record<string, string>>;
  /** Accesorios, en orden de pintado. */
  capas: readonly Capa[];
}

const SIN_CAMBIOS: VarianteSprite = { paleta: {}, capas: [] };

export const VARIANTES: Readonly<Record<string, VarianteSprite>> = {
  "angel-clasico": SIN_CAMBIOS,
  // Pelo canoso, moño al costado, gafas y chal rosa.
  "angel-abuela": {
    paleta: { h: "L", H: "l" },
    capas: [
      {

        rects: [
          [4, 4, 4, 4, "L"],
          [4, 7, 4, 1, "l"],
          [5, 4, 2, 1, "k"],
          // gafas: dos marcos y un puente
          [10, 10, 5, 1, "q"], [10, 13, 5, 1, "q"], [10, 11, 1, 2, "q"], [14, 11, 1, 2, "q"],
          [17, 10, 5, 1, "q"], [17, 13, 5, 1, "q"], [17, 11, 1, 2, "q"], [21, 11, 1, 2, "q"],
          [15, 11, 2, 1, "q"],
        ],
      },
      { zonas: [[10, 18, 13, 4], [11, 22, 3, 3], [19, 22, 3, 3]], mapa: { w: "P", g: "Q" } },
    ],
  },
  // Gorra naranja y silbato al cuello.
  "angel-coach": {
    paleta: {},
    capas: [
      {

        rects: [
          [10, 4, 12, 3, "O"],
          [9, 7, 15, 1, "O"],
          [24, 7, 3, 1, "O"],
          [10, 6, 12, 1, "k"],
          [10, 7, 1, 1, "k"],
        ],
      },
      {

        rects: [
          [12, 19, 1, 1, "q"], [13, 20, 1, 1, "q"], [14, 21, 1, 1, "q"],
          [19, 19, 1, 1, "q"], [18, 20, 1, 1, "q"], [17, 21, 1, 1, "q"],
          [15, 21, 2, 2, "O"], [15, 23, 2, 1, "k"],
        ],
      },
    ],
  },
  // Corbata azul y maletín.
  "angel-abogado": {
    paleta: {},
    capas: [
      { zonas: [[15, 19, 2, 12]], mapa: { w: "u", g: "U" } },
      {

        rects: [
          [26, 24, 2, 1, "k"], [25, 25, 1, 1, "k"], [28, 25, 1, 1, "k"],
          [24, 26, 7, 5, "o"], [24, 26, 7, 1, "k"], [24, 30, 7, 1, "k"], [24, 26, 1, 5, "k"], [30, 26, 1, 5, "k"],
          [27, 28, 1, 1, "y"],
        ],
      },
    ],
  },
  // Barba y bigote canosos, corona de laurel.
  "angel-filosofo": {
    paleta: {},
    capas: [
      { zonas: [[10, 16, 12, 2]], mapa: { s: "L", S: "l" } },
      {

        rects: [
          [12, 13, 3, 1, "L"], [17, 13, 3, 1, "L"],
          [12, 18, 8, 2, "L"], [13, 20, 6, 1, "l"],
          // laurel: hojas alternas sobre el pelo
          [8, 8, 1, 1, "N"], [9, 8, 1, 1, "n"], [10, 7, 1, 1, "N"], [11, 8, 1, 1, "n"], [12, 7, 1, 1, "N"],
          [13, 8, 1, 1, "n"], [14, 7, 1, 1, "N"], [17, 7, 1, 1, "N"], [18, 8, 1, 1, "n"], [19, 7, 1, 1, "N"],
          [20, 8, 1, 1, "n"], [21, 7, 1, 1, "N"], [22, 8, 1, 1, "n"], [23, 8, 1, 1, "N"],
        ],
      },
    ],
  },

  "diablo-clasico": SIN_CAMBIOS,
  // Corazón roto en el pecho y una lágrima.
  "diablo-ex-toxico": {
    paleta: {},
    capas: [
      {

        rects: [
          [13, 20, 2, 1, "i"], [17, 20, 2, 1, "i"],
          [12, 21, 8, 2, "i"], [13, 23, 6, 1, "i"], [14, 24, 4, 1, "i"], [15, 25, 2, 1, "i"],
          // grieta en zigzag
          [16, 20, 1, 1, "k"], [15, 21, 1, 1, "k"], [16, 22, 1, 1, "k"], [15, 23, 1, 1, "k"], [16, 24, 1, 1, "k"],
        ],
      },
      { rects: [[10, 13, 1, 2, "z"]] },
    ],
  },
  // Cuernos dorados, gafas de sol de neón y una moneda.
  "diablo-cripto": {
    paleta: { c: "y", C: "M" },
    capas: [
      {

        rects: [
          [9, 9, 6, 4, "k"], [10, 10, 4, 2, "n"],
          [18, 9, 6, 4, "k"], [19, 10, 4, 2, "n"],
          [15, 10, 3, 1, "k"],
        ],
      },
      {

        rects: [
          [14, 20, 4, 1, "k"], [13, 21, 6, 4, "k"], [14, 25, 4, 1, "k"],
          [14, 21, 4, 4, "y"], [15, 22, 2, 2, "M"],
        ],
      },
    ],
  },
  // Sombrero de paja, bigote y cadena dorada.
  "diablo-narco": {
    paleta: {},
    capas: [
      {

        rects: [
          [11, 3, 10, 4, "T"], [11, 5, 10, 1, "K"],
          [7, 7, 18, 1, "M"], [8, 6, 16, 1, "T"],
          [12, 13, 3, 1, "K"], [17, 13, 3, 1, "K"],
        ],
      },
      {

        rects: [
          [11, 18, 1, 1, "y"], [12, 19, 1, 1, "y"], [13, 20, 1, 1, "y"], [14, 21, 1, 1, "y"],
          [20, 18, 1, 1, "y"], [19, 19, 1, 1, "y"], [18, 20, 1, 1, "y"], [17, 21, 1, 1, "y"],
          [15, 22, 2, 2, "y"], [15, 23, 2, 1, "M"],
        ],
      },
    ],
  },
  // Pelo rosa, aro de luz y celular.
  "diablo-influencer": {
    paleta: {},
    capas: [
      { zonas: [[10, 5, 12, 4]], mapa: { V: "P", v: "P" } },
      {

        rects: [
          // aro de luz a la izquierda (anillo de 7×7)
          [2, 5, 3, 1, "x"], [1, 6, 1, 1, "x"], [5, 6, 1, 1, "x"],
          [0, 7, 1, 3, "x"], [6, 7, 1, 3, "x"], [1, 10, 1, 1, "x"], [5, 10, 1, 1, "x"], [2, 11, 3, 1, "x"],
          [3, 8, 1, 1, "Y"],
        ],
      },
      {

        rects: [
          [19, 19, 5, 8, "k"], [20, 20, 3, 5, "z"], [21, 26, 1, 1, "x"],
        ],
      },
    ],
  },
};

const BASE: Record<DebateRole, Record<FotogramaDebatiente, MatrizSprite>> = { pro: ANGEL, con: DIABLO };

/** En el fotograma "golpe" el personaje queda un píxel a la derecha de donde está en reposo. */
const DESPLAZAMIENTO_GOLPE: readonly [number, number] = [1, 0];

function desplazamiento(fotograma: FotogramaDebatiente): readonly [number, number] {
  return fotograma === "golpe" ? DESPLAZAMIENTO_GOLPE : [0, 0];
}

export function tieneVariante(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(VARIANTES, id);
}

/** Ids con variante, para las pruebas. */
export function idsConVariante(): string[] {
  return Object.keys(VARIANTES);
}

/**
 * Matriz del Ángel (`pro`) o del Diablo (`con`) con la variante de la personalidad `id`.
 * Un id sin variante (o desconocido) devuelve la matriz base, que es la del clásico.
 */
export function matrizVariante(
  rol: DebateRole,
  id: string | undefined,
  fotograma: FotogramaDebatiente,
): MatrizSprite {
  const base = BASE[rol][fotograma] ?? BASE[rol].reposo;
  const variante = id && tieneVariante(id) ? VARIANTES[id] : undefined;
  if (!variante || (!Object.keys(variante.paleta).length && !variante.capas.length)) return base;

  const lado = base.length;
  const px: string[][] = base.map((fila) => [...fila].map((c) => variante.paleta[c] ?? c));
  const [dx, dy] = desplazamiento(fotograma);
  const dentro = (x: number, y: number) => y >= 0 && y < lado && x >= 0 && x < px[y].length;

  for (const capa of variante.capas) {
    if ("rects" in capa) {
      for (const [x0, y0, w, h, c] of capa.rects) {
        for (let y = y0; y < y0 + h; y++)
          for (let x = x0; x < x0 + w; x++) if (dentro(x + dx, y + dy)) px[y + dy][x + dx] = c;
      }
    } else {
      for (const [x0, y0, w, h] of capa.zonas) {
        for (let y = y0; y < y0 + h; y++)
          for (let x = x0; x < x0 + w; x++) {
            if (!dentro(x + dx, y + dy)) continue;
            const nuevo = capa.mapa[px[y + dy][x + dx]];
            if (nuevo) px[y + dy][x + dx] = nuevo;
          }
      }
    }
  }
  return px.map((fila) => fila.join(""));
}
