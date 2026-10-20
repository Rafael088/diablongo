// Topes de /api/debate. Un solo lugar: los usan el servidor y la interfaz.

/** Largo máximo del tema, en caracteres (ya sin espacios en los bordes). */
export const MAX_TEMA = 200;

/** Largo máximo de lo que escribe la persona durante el debate, en caracteres. */
export const MAX_INTERVENCION = 200;

/** Largo máximo de un mensaje del historial. Cada frase tiene como mucho 35 palabras
 *  (unos 250 caracteres en español); 400 deja holgura sin permitir textos enormes. */
export const MAX_MENSAJE_HISTORIAL = 400;

/** Intervenciones de la persona que puede haber en el historial. */
export const MAX_INTERVENCIONES_USUARIO = 4;

/** Mensajes de personajes en el historial: 8 turnos del juego. */
export const MAX_MENSAJES_PERSONAJES = 8;

/** Mensajes totales del historial: 8 de personajes + 4 de la persona. */
export const MAX_MENSAJES_HISTORIAL = MAX_MENSAJES_PERSONAJES + MAX_INTERVENCIONES_USUARIO;

/**
 * Tokens máximos de cada respuesta del modelo, fijos en el servidor.
 * Una frase de 35 palabras en español son unos 50-70 tokens (≈1,5-2 tokens por palabra);
 * 120 deja casi el doble de margen y corta cualquier respuesta desbocada.
 */
export const MAX_TOKENS_RESPUESTA = 120;

/** Tamaño máximo del cuerpo de la petición, en bytes (el peor caso legítimo ronda 6 KB). */
export const MAX_CUERPO_BYTES = 16 * 1024;
