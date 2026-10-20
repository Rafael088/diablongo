// Genera docs/sprites.png con todos los personajes y fotogramas a escala 4×,
// sin arrancar el servidor: arma un HTML con los SVG y le saca captura con
// Chromium (o Edge/Chrome) en modo headless.
// Uso: node scripts/captura-sprites.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  NOMBRE_PERSONAJE,
  SPRITES,
  TAMANO_SPRITE,
  svgDeMatriz,
  type MatrizSprite,
} from "../lib/sprites/index.ts";

const ESCALA = 4;
const lado = TAMANO_SPRITE * ESCALA;
const raiz = resolve(import.meta.dirname, "..");
const salida = join(raiz, "docs", "sprites.png");

const filas = Object.entries(SPRITES)
  .map(([personaje, fotogramas]) => {
    const celdas = Object.entries(fotogramas as Record<string, MatrizSprite>)
      .map(
        ([fotograma, matriz]) =>
          `<figure>${svgDeMatriz(matriz, ESCALA)}<figcaption>${fotograma}</figcaption></figure>`,
      )
      .join("");
    const nombre = NOMBRE_PERSONAJE[personaje as keyof typeof NOMBRE_PERSONAJE];
    return `<section><h2>${nombre}</h2><div class="fila">${celdas}</div></section>`;
  })
  .join("");

const ancho = 4 * (lado + 24) + 48;
const alto = 3 * (lado + 70) + 40;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:20px 24px;background:#14121c;color:#e4e4e7;font:14px system-ui,sans-serif}
h2{margin:0 0 6px;font-size:16px;font-weight:600}
section{margin-bottom:14px}.fila{display:flex;gap:24px}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px}
figcaption{color:#a1a1aa;font-size:12px}svg{display:block}
</style>${filas}`;

const dir = mkdtempSync(join(tmpdir(), "sprites-"));
const pagina = join(dir, "sprites.html");
writeFileSync(pagina, html);
mkdirSync(join(raiz, "docs"), { recursive: true });

const navegadores = ["chromium", "chromium-browser", "google-chrome-stable", "microsoft-edge-stable"];
let hecho = false;
for (const nav of navegadores) {
  try {
    execFileSync(
      nav,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        `--user-data-dir=${join(dir, "perfil")}`,
        `--window-size=${ancho},${alto}`,
        `--screenshot=${salida}`,
        `file://${pagina}`,
      ],
      { stdio: "ignore" },
    );
    hecho = true;
    break;
  } catch {
    // probar el siguiente navegador
  }
}

if (!hecho) {
  console.error("No encontré Chromium, Chrome ni Edge para sacar la captura.");
  process.exit(1);
}
console.log(`Captura guardada en ${salida}`);
