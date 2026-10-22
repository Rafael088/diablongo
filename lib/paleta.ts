// Paleta única de la interfaz: los ocho colores del tablero de marca de Diablongo
// (#FF4D6D, #D7263D, #F6E7C3, #6A5ACD, #0F0E17, #4B4862, #FFC857, #7ED6FF) y dos
// derivados donde el original no da el contraste de texto. Los sprites no cambian.
// globals.css repite estos mismos valores en :root (los lee el CSS) y
// scripts/contraste.ts comprueba que ambos coinciden y que el contraste da AA.
// El canvas de la tarjeta importa esta constante en vez de leer el DOM.
export const TOKENS = {
  "--color-fondo": "#0F0E17", // noche de la marca: fondo de página y escenario
  "--color-superficie": "#17151F", // caja de diálogo, marcador, campos (un paso sobre el fondo)
  "--color-borde": "#F6E7C3", // crema: bordes duros
  "--color-borde-suave": "#4B4862", // gris violeta: separadores decorativos, nunca solo
  "--color-texto": "#F6E7C3", // crema: texto principal
  "--color-texto-suave": "#B4ACCF", // derivado de #4B4862 aclarado para leerse como texto
  "--color-angel": "#7ED6FF", // celeste del angelito
  "--color-angel-brillo": "#FFC857", // oro del halo
  "--color-diablo": "#FF4D6D", // rojo del Diablongo
  "--color-diablo-fuego": "#D7263D", // rojo oscuro: contornos y barra, no texto
  "--color-violeta": "#6A5ACD", // suelo del escenario y sombras
  "--color-usuario": "#9D93F0", // derivado de #6A5ACD aclarado: lo que dice la persona
  "--color-acento": "#FFC857", // oro: foco, selección
  "--color-error": "#FFA8B6",
} as const;

export type NombreToken = keyof typeof TOKENS;
