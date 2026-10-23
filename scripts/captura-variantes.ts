// Vuelca todas las variantes de personalidad a SVG (uno por id y fotograma) en la carpeta dada,
// más una hoja con todo junto. Uso: node --experimental-strip-types scripts/captura-variantes.ts <carpeta>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONALIDADES } from "../lib/personalidades.ts";
import { PALETA_SPRITES, TAMANO_SPRITE, rectsDeMatriz } from "../lib/sprites/index.ts";
import { matrizVariante } from "../lib/sprites/variantes.ts";

const carpeta = process.argv[2];
if (!carpeta) throw new Error("Falta la carpeta de salida.");
mkdirSync(carpeta, { recursive: true });
void PALETA_SPRITES;

const FOTOGRAMAS = ["reposo", "hablar", "golpe", "victoria"] as const;
const ESC = 8;
const lado = TAMANO_SPRITE * ESC;
let hoja = "";
let fila = 0;
for (const rol of ["pro", "con"] as const) {
  for (const p of PERSONALIDADES[rol]) {
    FOTOGRAMAS.forEach((f, col) => {
      const rects = rectsDeMatriz(matrizVariante(rol, p.id, f))
        .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.ancho}" height="1" fill="${r.color}"/>`)
        .join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 32 32" shape-rendering="crispEdges">${rects}</svg>`;
      writeFileSync(join(carpeta, `${p.id}-${f}.svg`), svg);
      hoja += `<g transform="translate(${col * lado} ${fila * lado}) scale(${ESC})">${rects}</g>`;
    });
    fila++;
  }
}
writeFileSync(
  join(carpeta, "hoja.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${4 * lado}" height="${fila * lado}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#0F0E17"/>${hoja}</svg>`,
);
