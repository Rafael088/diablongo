// Temas CRÍTICOS: no se juegan. En vez del debate se muestra la pantalla de ayuda (components/PantallaAyuda).
//
// Decisión del 2026-10-21 tras la prueba de seguridad (docs/seguridad/revision-2026-10-21.md): con el prompt
// solo, el Diablo empujaba al daño en los 4 modelos probados. Para lo crítico la barrera está en el código:
//   1. patrones en español (aquí; corren también en el navegador, sin red);
//   2. en el servidor, un clasificador con un modelo (clasificarConModelo) para lo que los patrones no ven.
// Crítico = hacerse daño o suicidio, dejar de comer o purgarse, drogas duras o desconocidas, retos que
// lastiman el cuerpo. Lo delicado pero no crítico (robar, armas, manejar tomado, pelear, un porro) SÍ se
// juega: ahí el Diablo solo tienta hacia algo inofensivo (lib/prompts.ts).

export type CategoriaCritica = "autolesion" | "alimentacion" | "drogas" | "reto";

/** Minúsculas y sin tildes, para que «daño», «dano» y «DAÑO» coincidan igual. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

// Sobre texto normalizado (sin tildes; la ñ queda como «n»).
const PATRONES: Record<CategoriaCritica, RegExp[]> = {
  autolesion: [
    /\bsuicid/,
    /\b(matarme|quitarme la vida|acabar con mi vida|terminar con mi vida|me quiero morir|quiero morirme|morirme ya)\b/,
    /\bno (quiero|aguanto) (vivir|seguir viviendo|seguir aqui|estar aqui|despertar)\b/,
    /\b(acabar|terminar) con todo\b/,
    /\b(me rindo|rendirme|tirar la toalla) con (todo|la vida)\b/,
    /\bseguir adelante o (mejor )?(me rindo|lo dejo todo|acabo)\b/,
    /\bcarta de despedida\b/,
    /\b(siento|creo) que (sobro|estorbo|no deberia existir)\b/,
    /\b(estarian|estaria|vivirian) mejor sin mi\b/,
    /\b(hacerme|me hago|hacerme un|me hare) (dano|danos|heridas?)\b/,
    /\b(cortarme|me corto|me cortare|lastimarme|herirme|quemarme|golpearme a mi mismo)\b/,
    /\bautolesi/,
    /\b(tirarme|lanzarme|me tiro|me lanzo|me boto) (de|del|desde|por|al) /,
    /\b(ahorcarme|colgarme)\b/,
    /\bsobredosis\b/,
    /\bdesaparecer para siempre\b/,
  ],
  alimentacion: [
    /\b(dejo|dejar|deje) de comer\b/,
    /\bno comer (nada|en|durante|por|toda|todo)\b/,
    /\b(ayuno|ayunar) (de |por |durante |toda |todo |varios |una semana|\d)/,
    /\b(vomitar|vomito) (despues|lo que|para)\b/,
    /\bme (provoco|hago) (el )?vomit/,
    /\b(purgarme|purgas?)\b/,
    /\blaxantes? para (bajar|adelgazar|no engordar)\b/,
    /\bsaltarme (todas )?las comidas\b/,
  ],
  drogas: [
    /\b(cocaina|perico|tusi|heroina|fentanilo|crack|metanfetamina|ketamina|keta|lsd|extasis|mdma|bazuco)\b/,
    /\bcoca\b(?![ -]?cola)/,
    /\bpastillas? (que me (dieron|regalaron|pasaron|vendieron)|sin saber|desconocidas?|raras?)\b/,
    /\b(mezclar|mezclo|mezcla) (alcohol|trago|licor|guaro) (con|y) (pastillas|pepas|medicamentos)\b/,
    /\b(pepas|pepa) (que|sin)\b/,
    /\binyectarme\b/,
  ],
  reto: [
    /\b(hasta|para) desmayarme\b/,
    /\baguantar la respiracion\b/,
    /\b(reto|challenge) de (asfixia|ahogo|desmayo|apnea)\b/,
    /\bblackout challenge\b/,
  ],
};

/** Categoría crítica del texto según los patrones, o null. */
export function categoriaCritica(texto: string): CategoriaCritica | null {
  const t = normalizar(texto);
  for (const [categoria, patrones] of Object.entries(PATRONES) as [CategoriaCritica, RegExp[]][]) {
    if (patrones.some((re) => re.test(t))) return categoria;
  }
  return null;
}

export const MENSAJE_TEMA_CRITICO =
  "Esto no es para un juego. Mira la pantalla de ayuda: hay gente que te puede escuchar ahora mismo.";

// ---- Clasificador con modelo (solo servidor; usa la OPENROUTER_API_KEY del servidor) ----

/** Barato, rápido y deja apagar el razonamiento (lib/openrouter.ts). */
export const MODELO_CLASIFICADOR = "anthropic/claude-haiku-5.5";
export const TIEMPO_MAX_CLASIFICADOR_MS = 4000;

export const PROMPT_CLASIFICADOR = `Clasificas la pregunta que una persona escribe en un juego donde un Ángel y un Diablo debaten su decisión.
Responde SOLO con una palabra: CRITICO o NO.
CRITICO si la decisión trata, aunque sea con rodeos o en broma, de: hacerse daño o quitarse la vida, rendirse con la vida o sentir que sobra; dejar de comer, ayunos extremos, vomitar o purgarse para adelgazar; consumir drogas duras o sustancias desconocidas (cocaína, pastillas de una fiesta, mezclar alcohol con pastillas); o retos que lastiman el cuerpo (asfixia, desmayarse).
NO para todo lo demás, incluidas decisiones delicadas pero no de ese tipo: robar, mentir, armas, pelear, manejar tomado, un porro, gastar de más, comer dulces, renunciar al trabajo.`;

/** Lo mínimo de fetch que se usa (inyectable en pruebas). */
export type Buscar = (url: string, init: RequestInit) => Promise<Response>;

/**
 * false solo si el modelo responde «NO»; true con cualquier otra respuesta; null si no se pudo preguntar
 * (sin key, error HTTP o de red, respuesta vacía o más de TIEMPO_MAX_CLASIFICADOR_MS). Quien lo llama decide qué hacer con null (los patrones mandan).
 */
export async function clasificarConModelo(
  texto: string,
  key: string | undefined,
  buscar: Buscar = fetch,
  tiempoMax = TIEMPO_MAX_CLASIFICADOR_MS
): Promise<boolean | null> {
  if (!key) return null;
  try {
    const r = await buscar("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://agent-debate.vercel.app",
        "X-Title": "Agent Debate",
      },
      body: JSON.stringify({
        model: MODELO_CLASIFICADOR,
        messages: [
          { role: "system", content: PROMPT_CLASIFICADOR },
          { role: "user", content: texto },
        ],
        temperature: 0,
        max_tokens: 5,
        reasoning: { enabled: false },
      }),
      signal: AbortSignal.timeout(tiempoMax),
    });
    if (!r.ok) return null;
    const datos = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
    const respuesta = String(datos.choices?.[0]?.message?.content ?? "").trim().toUpperCase();
    // Solo un «NO» claro deja jugar. Ante lo más grave el modelo a veces deja de clasificar y empieza a
    // consolar («Lo que estás sintiendo…», medido el 2026-10-21): cualquier otra respuesta cuenta como crítico.
    if (/^NO\b/.test(respuesta)) return false;
    return respuesta.length > 0 ? true : null;
  } catch {
    return null;
  }
}

/**
 * ¿Hay que mostrar ayuda en vez de jugar? Los patrones bastan para decir que sí (y no gastan red); si no
 * coinciden, se pregunta al modelo. Si el modelo no responde, se juega (los patrones ya dijeron que no):
 * el prompt del Diablo lleva además su propio freno para lo crítico.
 */
export async function esTemaCritico(
  texto: string,
  key: string | undefined,
  buscar: Buscar = fetch
): Promise<boolean> {
  if (categoriaCritica(texto)) return true;
  return (await clasificarConModelo(texto, key, buscar)) === true;
}
