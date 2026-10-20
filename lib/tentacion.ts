// Barra de tentación (tira y afloja): módulo puro, sin React.
// Escala de -100 a 100: el Ángel ("pro") empuja hacia -100 (izquierda) y el
// Diablo ("con") hacia +100 (derecha), igual que en pantalla.

export type Bando = "pro" | "con";
export type Ganando = Bando | "empate";

export const MINIMO = -100;
export const TOPE = 100;
export const VALOR_INICIAL = 0;
/** Lo que mueve un 👍. Cada personaje dice 4 frases en un debate de 8 turnos: 4 👍 al mismo bando llegan justo al extremo (±100). */
export const PASO = 25;

export function limitar(valor: number): number {
  return Math.max(MINIMO, Math.min(TOPE, valor));
}

/** Aplica un 👍 a una frase de `bando` y devuelve el valor nuevo (con tope). */
export function aplicarVoto(valor: number, bando: Bando): number {
  return limitar(valor + (bando === "con" ? PASO : -PASO));
}

/** Quién va ganando según el valor de la barra. */
export function quienGana(valor: number): Ganando {
  if (valor < 0) return "pro";
  if (valor > 0) return "con";
  return "empate";
}

/**
 * Valor de la barra a partir de los votos: `bandos[i]` es quién dijo el
 * mensaje i (o "user") y `votos` los índices con 👍. Cada índice cuenta una vez.
 */
export function valorDeVotos(
  bandos: ReadonlyArray<string>,
  votos: ReadonlyArray<number>,
): number {
  let valor = VALOR_INICIAL;
  for (const i of new Set(votos)) {
    const b = bandos[i];
    if (b === "pro" || b === "con") valor = aplicarVoto(valor, b);
  }
  return valor;
}

export function textoGanando(g: Ganando): string {
  return g === "pro"
    ? "Vas más con el Ángel"
    : g === "con"
      ? "Vas más con el Diablo"
      : "Empate";
}
