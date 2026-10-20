/**
 * Manejo de audio (blips de 8 bits) al escribir texto.
 * AudioContext se crea de forma perezosa en el primer gesto del usuario.
 */

/** Contexto de audio global (perezoso). */
let audioContext: AudioContext | null = null;

/**
 * Obtiene el AudioContext, creándolo si no existe.
 * Los navegadores bloquean audio antes de un gesto del usuario,
 * así que esto solo funciona después de que el usuario haya interactuado.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    return null;
  }
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

/**
 * Frecuencia base según el personaje (Ángel o Diablo).
 */
export function getBaseFrequency(speaker: "pro" | "con"): number {
  return speaker === "pro" ? 880 : 220;
}

/**
 * Toca un blip corto con variación aleatoria de tono.
 * @param frequency Frecuencia base en Hz
 * @param duration Duración en milisegundos (por defecto 50)
 * @param volume Volumen (0-1, por defecto 0.05)
 */
export function playBlip(frequency: number, duration = 50, volume = 0.05): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const durationSecs = duration / 1000;

  // Variación aleatoria de tono (±5%)
  const variation = 1 + (Math.random() - 0.5) * 0.1;
  const finalFrequency = frequency * variation;

  // Oscilador square
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = finalFrequency;

  // Ganancia (volumen) con envolvente rápida para evitar clics
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSecs);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSecs);
}

/**
 * Determina si en la posición `charIndex` del texto debe sonar un blip.
 * Reglas:
 * - Un blip cada 2 caracteres "reales" (ignorando espacios y puntuación)
 * - Nunca en espacios ni puntuación
 * @param text Texto completo
 * @param charIndex Índice del carácter mostrado (0-indexed)
 * @returns true si debe sonar un blip
 */
export function shouldPlayBlip(text: string, charIndex: number): boolean {
  if (charIndex >= text.length) return false;

  const char = text[charIndex];
  // No tocamos blips en espacios ni puntuación
  if (/[\s\p{P}]/u.test(char)) return false;

  // Contar caracteres "reales" hasta este punto (excluyendo espacios y puntuación)
  let realCount = 0;
  for (let i = 0; i <= charIndex; i++) {
    if (!/[\s\p{P}]/u.test(text[i])) {
      realCount++;
    }
  }

  // Tocar cada 2 caracteres reales (en el 2º, 4º, 6º, etc.)
  return realCount % 2 === 0;
}

/** Mayor avance (en letras) que aún cuenta como escritura normal; más es un salto (skip). */
export const MAX_AVANCE_BLIP = 3;

/**
 * Decide si suena un blip al pasar de `prev` a `count` letras mostradas de `text`.
 * Suena como mucho uno (el del último carácter nuevo) y nunca en un salto grande.
 * Si la frase es nueva, el llamador pasa prev = 0 y la primera letra puede sonar.
 */
export function blipAlAvanzar(text: string, prev: number, count: number): boolean {
  const avance = count - prev;
  if (avance < 1 || avance > MAX_AVANCE_BLIP) return false;
  return shouldPlayBlip(text, count - 1);
}
