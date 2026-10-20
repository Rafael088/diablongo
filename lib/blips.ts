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

/**
 * Hook para leer/escribir la preferencia de sonido en localStorage.
 * Envuelto en try/catch para evitar errores si localStorage no está disponible.
 */
export function useSoundPreference(): [boolean, (enabled: boolean) => void] {
  const getEnabled = (): boolean => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem("sound-enabled");
      if (stored === null) return true; // Por defecto activado
      return stored === "true";
    } catch {
      return true;
    }
  };

  const setEnabled = (enabled: boolean): void => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sound-enabled", enabled ? "true" : "false");
    } catch {
      // Ignorar errores de localStorage
    }
  };

  return [getEnabled(), setEnabled];
}
