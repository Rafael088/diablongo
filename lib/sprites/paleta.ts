// Paleta única de los sprites: un carácter → un color.
// Es la fuente de verdad de los colores de los personajes; la tarea de paleta
// global puede importarla desde aquí. "." no está porque es transparente.
export const TRANSPARENTE = ".";

export const PALETA_SPRITES = {
  k: "#1b1026", // contorno
  x: "#ffffff", // brillo
  e: "#2a1a3a", // ojos
  s: "#f7cfa6", // piel
  S: "#dca27c", // piel sombra
  p: "#f59bb1", // rubor
  m: "#9b2f4a", // boca
  w: "#f5f2ea", // tunica
  g: "#c7c2d8", // tunica sombra
  y: "#ffcc3a", // oro / halo
  Y: "#fff3a0", // halo brillante
  h: "#f3c662", // pelo rubio
  H: "#c9923a", // pelo rubio sombra
  b: "#e6efff", // ala
  B: "#9fb6e0", // ala sombra
  r: "#e2483d", // rojo diablo
  R: "#9e2b3c", // rojo sombra
  v: "#7a46b8", // morado
  V: "#4c2c80", // morado sombra
  c: "#f4e4c1", // cuerno
  C: "#c9b48c", // cuerno sombra
  t: "#ffffff", // dientes
  f: "#ff8a2a", // fuego
  F: "#ffe066", // fuego claro
  a: "#5f86c4", // sudadera
  A: "#3f5f99", // sudadera sombra
  d: "#6b4430", // pelo castano
  D: "#4a2d20", // pelo castano sombra
  j: "#3b3d52", // pantalon
  z: "#8fd3ff", // gota de sudor / idea
  // Colores de las variantes de personalidad (lib/sprites/variantes.ts). Los sprites base no los usan.
  L: "#e8e6ef", // pelo canoso / barba
  l: "#b3afc7", // canoso sombra
  P: "#d0618f", // chal rosa
  Q: "#98385f", // chal sombra
  q: "#5a3a22", // marco de gafas / cuero oscuro
  o: "#9a6a35", // madera, maletín
  n: "#4ade80", // verde neón (lentes cripto, laurel claro)
  N: "#1f8f4e", // verde oscuro (laurel)
  u: "#2f6fd0", // azul (corbata, gorra)
  U: "#1d478f", // azul sombra
  i: "#ff3b6b", // corazón
  T: "#e3c487", // sombrero de paja claro
  M: "#a8823f", // sombrero sombra / cadena vieja
  K: "#2d2d3a", // negro suave (sombrero, celular)
  O: "#ff9f1c", // naranja (silbato, gorra coach)
} as const satisfies Record<string, `#${string}`>;

export type CaracterPaleta = keyof typeof PALETA_SPRITES;
