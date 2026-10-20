// Calcula el contraste (WCAG) de los pares de color de la interfaz.
// Falla con exit 1 si un par de texto baja de 4.5:1 o si globals.css no
// coincide con lib/paleta.ts. Uso: node scripts/contraste.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOKENS, type NombreToken } from "../lib/paleta.ts";

const css = readFileSync(resolve(import.meta.dirname, "..", "app", "globals.css"), "utf8");

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

let fallos = 0;

// 1. globals.css repite los tokens tal cual.
for (const [nombre, valor] of Object.entries(TOKENS)) {
  const hay = new RegExp(`${nombre}:\\s*${valor}\\s*;`, "i").test(css);
  if (!hay) {
    console.error(`DESAJUSTE: ${nombre} debería ser ${valor} en app/globals.css`);
    fallos++;
  }
}

// 2. Pares de texto (mínimo 4.5) y de elementos gráficos (mínimo 3).
type Par = [texto: NombreToken, fondo: NombreToken, minimo: number, uso: string];
const pares: Par[] = [
  ["--color-texto", "--color-fondo", 4.5, "texto sobre el fondo"],
  ["--color-texto", "--color-superficie", 4.5, "texto en la caja de diálogo"],
  ["--color-texto-suave", "--color-fondo", 4.5, "texto suave sobre el fondo"],
  ["--color-texto-suave", "--color-superficie", 4.5, "texto suave en la caja"],
  ["--color-angel", "--color-fondo", 4.5, "nombre del Ángel sobre el fondo"],
  ["--color-angel", "--color-superficie", 4.5, "nombre del Ángel en la caja"],
  ["--color-angel-brillo", "--color-superficie", 4.5, "halo brillante en la caja"],
  ["--color-diablo", "--color-fondo", 4.5, "nombre del Diablo sobre el fondo"],
  ["--color-diablo", "--color-superficie", 4.5, "nombre del Diablo en la caja"],
  ["--color-diablo-fuego", "--color-superficie", 4.5, "fuego del Diablo en la caja"],
  ["--color-usuario", "--color-fondo", 4.5, "texto del usuario sobre el fondo"],
  ["--color-usuario", "--color-superficie", 4.5, "texto del usuario en la caja"],
  ["--color-acento", "--color-superficie", 4.5, "acento en la caja"],
  ["--color-error", "--color-fondo", 4.5, "error sobre el fondo"],
  ["--color-error", "--color-superficie", 4.5, "error en la caja"],
  ["--color-borde", "--color-fondo", 3, "borde sobre el fondo (gráfico)"],
];

console.log("| Texto / elemento | Fondo | Contraste | Mínimo | Uso |");
console.log("| --- | --- | --- | --- | --- |");
for (const [t, f, minimo, uso] of pares) {
  const c = contraste(TOKENS[t], TOKENS[f]);
  const ok = c >= minimo;
  if (!ok) fallos++;
  console.log(`| ${t} ${TOKENS[t]} | ${f} ${TOKENS[f]} | ${c.toFixed(2)}:1 | ${minimo} | ${uso}${ok ? "" : " FALLA"} |`);
}

if (fallos) {
  console.error(`\n${fallos} problema(s).`);
  process.exit(1);
}
console.log("\nTodos los pares cumplen.");
