// Migrado a tests/sprites.test.ts; este script se mantiene por compatibilidad
// Comprueba que cada sprite sea de 32×32 y use solo caracteres de la paleta.
// Uso: node scripts/comprobar-sprites.ts   (sale con código 1 si algo falla)
import {
  PALETA_SPRITES,
  SPRITES,
  TAMANO_SPRITE,
  TRANSPARENTE,
} from "../lib/sprites/index.ts";

const errores: string[] = [];
const paleta = new Set<string>([TRANSPARENTE, ...Object.keys(PALETA_SPRITES)]);
let total = 0;

for (const [personaje, fotogramas] of Object.entries(SPRITES)) {
  if (!("reposo" in fotogramas)) errores.push(`${personaje}: falta el fotograma "reposo"`);
  for (const [fotograma, matriz] of Object.entries(fotogramas)) {
    total++;
    const id = `${personaje}/${fotograma}`;
    if (matriz.length !== TAMANO_SPRITE) {
      errores.push(`${id}: tiene ${matriz.length} filas, deben ser ${TAMANO_SPRITE}`);
    }
    matriz.forEach((fila, y) => {
      if (fila.length !== TAMANO_SPRITE) {
        errores.push(`${id} fila ${y}: tiene ${fila.length} columnas, deben ser ${TAMANO_SPRITE}`);
      }
      [...fila].forEach((c, x) => {
        if (!paleta.has(c)) errores.push(`${id} (${x},${y}): "${c}" no tiene color en la paleta`);
      });
    });
  }
}

if (errores.length > 0) {
  console.error(`✗ ${errores.length} problema(s) en los sprites:`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ ${total} sprites de ${TAMANO_SPRITE}×${TAMANO_SPRITE}, todos con colores de la paleta.`);
