// Genera el ícono de la app desde el sprite del Diablo (no hay imágenes hechas a mano):
// app/icon.svg, app/apple-icon.png (180×180) y app/favicon.ico (16, 32 y 48 px).
// Fondo noche de la marca con borde rojo, como el «ícono de app» del tablero de Diablongo.
// Uso: node scripts/generar-iconos.ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { matrizDe, rectsDeMatriz } from "../lib/sprites/index.ts";
import { TOKENS } from "../lib/paleta.ts";

const raiz = resolve(import.meta.dirname, "..");
const rects = rectsDeMatriz(matrizDe("con", "reposo"));

// Recorte al contenido del sprite, en un cuadrado centrado.
const x0 = Math.min(...rects.map((r) => r.x));
const x1 = Math.max(...rects.map((r) => r.x + r.ancho));
const y0 = Math.min(...rects.map((r) => r.y));
const y1 = Math.max(...rects.map((r) => r.y + 1));
const lado = Math.max(x1 - x0, y1 - y0);
const dx = x0 - Math.floor((lado - (x1 - x0)) / 2);
const dy = y0 - Math.floor((lado - (y1 - y0)) / 2);

const FONDO = TOKENS["--color-fondo"];
const BORDE = TOKENS["--color-diablo-fuego"];

/** Lienzo del ícono en celdas de sprite: margen de 2 celdas (1 de borde) alrededor. */
const MARGEN = 2;
const CELDAS = lado + MARGEN * 2;

function colorEn(cx: number, cy: number): string {
  const borde = cx === 0 || cy === 0 || cx === CELDAS - 1 || cy === CELDAS - 1;
  const esquina = (cx === 0 || cx === CELDAS - 1) && (cy === 0 || cy === CELDAS - 1);
  if (esquina) return "";
  if (borde) return BORDE;
  const sx = cx - MARGEN + dx;
  const sy = cy - MARGEN + dy;
  const r = rects.find((q) => q.y === sy && sx >= q.x && sx < q.x + q.ancho);
  return r ? r.color : FONDO;
}

// SVG: una celda por píxel de sprite.
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CELDAS} ${CELDAS}" shape-rendering="crispEdges">`;
for (let y = 0; y < CELDAS; y++) {
  for (let x = 0; x < CELDAS; x++) {
    const c = colorEn(x, y);
    if (c) svg += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
  }
}
svg += "</svg>\n";
writeFileSync(resolve(raiz, "app", "icon.svg"), svg);

// PNG RGBA mínimo con zlib (vecino más cercano: el pixel art no se suaviza).
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(b: Buffer): number {
  let c = -1;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function trozo(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
function png(px: number): Buffer {
  const filas: Buffer[] = [];
  for (let y = 0; y < px; y++) {
    const fila = Buffer.alloc(1 + px * 4);
    for (let x = 0; x < px; x++) {
      const c = colorEn(Math.floor((x * CELDAS) / px), Math.floor((y * CELDAS) / px));
      if (!c) continue;
      fila.writeUInt32BE(((parseInt(c.slice(1), 16) << 8) | 0xff) >>> 0, 1 + x * 4);
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0);
  ihdr.writeUInt32BE(px, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(Buffer.concat(filas))),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}
writeFileSync(resolve(raiz, "app", "apple-icon.png"), png(180));

// ICO con PNG dentro (lo aceptan todos los navegadores actuales).
const tamanos = [16, 32, 48];
const imagenes = tamanos.map(png);
const cabecera = Buffer.alloc(6 + 16 * tamanos.length);
cabecera.writeUInt16LE(1, 2);
cabecera.writeUInt16LE(tamanos.length, 4);
let desplazamiento = cabecera.length;
tamanos.forEach((t, i) => {
  const o = 6 + i * 16;
  cabecera[o] = t;
  cabecera[o + 1] = t;
  cabecera.writeUInt16LE(1, o + 4);
  cabecera.writeUInt16LE(32, o + 6);
  cabecera.writeUInt32LE(imagenes[i].length, o + 8);
  cabecera.writeUInt32LE(desplazamiento, o + 12);
  desplazamiento += imagenes[i].length;
});
writeFileSync(resolve(raiz, "app", "favicon.ico"), Buffer.concat([cabecera, ...imagenes]));

console.log(`Íconos generados desde el sprite del Diablo (${lado}×${lado} celdas + borde).`);
