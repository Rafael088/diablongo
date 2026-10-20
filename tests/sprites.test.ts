// Migrado de scripts/comprobar-sprites.ts (mismas aserciones).
import { describe, expect, it } from "vitest";
import { PALETA_SPRITES, SPRITES, TAMANO_SPRITE, TRANSPARENTE } from "../lib/sprites/index.ts";

describe("sprites", () => {
  const paleta = new Set<string>([TRANSPARENTE, ...Object.keys(PALETA_SPRITES)]);

  for (const [personaje, fotogramas] of Object.entries(SPRITES)) {
    it(`${personaje}: tiene fotograma "reposo"`, () => {
      expect("reposo" in fotogramas).toBe(true);
    });
    for (const [fotograma, matriz] of Object.entries(fotogramas)) {
      it(`${personaje}/${fotograma}: ${TAMANO_SPRITE}×${TAMANO_SPRITE} y solo colores de la paleta`, () => {
        expect(matriz.length).toBe(TAMANO_SPRITE);
        const fuera: string[] = [];
        matriz.forEach((fila, y) => {
          expect(fila.length, `fila ${y}`).toBe(TAMANO_SPRITE);
          [...fila].forEach((c, x) => {
            if (!paleta.has(c)) fuera.push(`(${x},${y}) "${c}"`);
          });
        });
        expect(fuera).toEqual([]);
      });
    }
  }
});
