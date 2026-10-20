// Paleta única de la interfaz: tokens semánticos derivados de PALETA_SPRITES.
// globals.css repite estos mismos valores en :root (los lee el CSS) y
// scripts/contraste.ts comprueba que ambos coinciden y que el contraste da AA.
// El canvas de la tarjeta importa esta constante en vez de leer el DOM.
import { PALETA_SPRITES as P } from "./sprites/paleta.ts";

export const TOKENS = {
  "--color-fondo": "#14121c", // fondo de página y escenario (más oscuro que el contorno k)
  "--color-superficie": "#0d0a14", // caja de diálogo, marcador, campos
  "--color-borde": P.x, // bordes duros blancos
  "--color-texto": P.w, // texto principal (túnica)
  "--color-texto-suave": P.g, // texto secundario (túnica sombra)
  "--color-angel": P.y, // oro del halo
  "--color-angel-brillo": P.Y, // halo brillante
  "--color-diablo": "#f0685c", // rojo diablo aclarado para que lea como texto
  "--color-diablo-fuego": P.f, // fuego
  "--color-usuario": P.z, // gota de idea: lo que dice la persona
  "--color-acento": P.F, // fuego claro: foco, selección
  "--color-error": "#ffa8a0",
} as const;

export type NombreToken = keyof typeof TOKENS;
