/**
 * Lógica pura del marcador de Ángel vs Diablo.
 * Sin acceso a window, localStorage, etc.
 */

export type Bando = "pro" | "con";

export interface Marcador {
  angel: number;
  diablo: number;
}

export const MARCADOR_INICIAL: Marcador = {
  angel: 0,
  diablo: 0,
};

/**
 * Suma una victoria a un bando.
 */
export function sumar(marcador: Marcador, quien: Bando): Marcador {
  return {
    ...marcador,
    [quien === "pro" ? "angel" : "diablo"]: (quien === "pro" ? marcador.angel : marcador.diablo) + 1,
  };
}

/**
 * Lee un marcador desde JSON crudo (desde localStorage).
 * Si el JSON está roto o los valores son inválidos (negativos, no enteros),
 * devuelve MARCADOR_INICIAL.
 */
export function leer(texto: string | null): Marcador {
  if (!texto) return MARCADOR_INICIAL;
  try {
    const datos = JSON.parse(texto);
    if (
      typeof datos === "object" &&
      datos !== null &&
      typeof datos.angel === "number" &&
      typeof datos.diablo === "number" &&
      Number.isInteger(datos.angel) &&
      Number.isInteger(datos.diablo) &&
      datos.angel >= 0 &&
      datos.diablo >= 0
    ) {
      return { angel: datos.angel, diablo: datos.diablo };
    }
  } catch {
    // JSON roto, devolver inicial
  }
  return MARCADOR_INICIAL;
}

/**
 * Crea un lector que recuerda la última lectura: si recibe el mismo texto crudo
 * que la vez anterior, devuelve el mismo objeto (===). Lo necesita
 * useSyncExternalStore, que exige un getSnapshot estable.
 */
export function crearLectorCacheado(): (texto: string | null) => Marcador {
  let ultimoTexto: string | null | undefined;
  let ultimo: Marcador = MARCADOR_INICIAL;
  return (texto) => {
    if (ultimoTexto === undefined || texto !== ultimoTexto) {
      ultimo = leer(texto);
      ultimoTexto = texto;
    }
    return ultimo;
  };
}

/**
 * Calcula el porcentaje de victorias para un bando.
 * Si total es 0, devuelve 0.
 */
function porcentaje(victorias: number, total: number): number {
  return total === 0 ? 0 : (victorias / total) * 100;
}

/**
 * Devuelve el título del marcador según el récord del usuario.
 * Umbrales:
 * - 0 partidas: "Alma en blanco"
 * - 1-2 partidas: "Recién llegado"
 * - >= 80% Diablo: "Eres un caso perdido"
 * - >= 60% Diablo: "Te dejas tentar"
 * - >= 80% Ángel: "Santo de altar"
 * - >= 60% Ángel: "Buena gente"
 * - resto: "Ni frío ni caliente"
 */
export function tituloSegunRecord(marcador: Marcador): string {
  const total = marcador.angel + marcador.diablo;

  if (total === 0) return "Alma en blanco";
  if (total < 3) return "Recién llegado";

  const porcDiablo = porcentaje(marcador.diablo, total);
  const porcAngel = porcentaje(marcador.angel, total);

  if (porcDiablo >= 80) return "Eres un caso perdido";
  if (porcDiablo >= 60) return "Te dejas tentar";
  if (porcAngel >= 80) return "Santo de altar";
  if (porcAngel >= 60) return "Buena gente";

  return "Ni frío ni caliente";
}
