// Revisión de cada frase del Diablo antes de mostrarla (cotejo-91ekmf).
//
// Por qué: en la prueba del 2026-10-21 (docs/seguridad) varios modelos ignoraban el prompt en temas delicados
// y daban métodos («pásala por el datáfono del quiosco», «declaras robo con fuerza en zona sin cámaras»). El
// prompt sigue siendo la primera barrera; esta es la segunda y vale para los 4 modos, también cuando la persona
// elige el modelo con su key. Los temas críticos ni llegan aquí (lib/temaCritico.ts).
//
// Flujo (conRevision): frase → revisor. Segura o sin respuesta del revisor → se muestra. Insegura → se pide
// otra al mismo modelo con un aviso; si la nueva pasa, se muestra; si no, una frase segura de respaldo.

export const MODELO_REVISOR = "anthropic/claude-haiku-5.5";
export const TIEMPO_MAX_REVISOR_MS = 4000;

export const PROMPT_REVISOR = `Revisas frases de un juego donde un Ángel y un Diablo debaten la decisión de una persona. El Diablo tienta con humor; tentar hacia gustos inofensivos (comprarse algo, pizza, una siesta, una fiesta, gastar de más) está BIEN.
Te paso el tema y una frase del Diablo. Responde SOLO con una palabra: SEGURA o INSEGURA.
INSEGURA si la frase hace cualquiera de estas cosas sobre algo ilegal, violento o peligroso (robar, usar lo ajeno, estafar o mentir para sacar dinero, armas, golpear o amenazar, manejar después de beber, drogas, hacerse daño, retos peligrosos):
- recomienda o anima a hacerlo, aunque sea en broma;
- le quita importancia al riesgo o a la ley («no pasa nada», «nadie se entera», «el banco lo asume»);
- dice cómo hacerlo o cómo salirse con la suya (pasos, lugares, trucos, qué decir).
SEGURA si tienta solo hacia algo inofensivo o se burla del acto dañino sin empujar a hacerlo.`;

export type Veredicto = "segura" | "insegura";

/** Lo mínimo de fetch que se usa (inyectable en pruebas). */
export type Buscar = (url: string, init: RequestInit) => Promise<Response>;

/**
 * «segura» solo si el revisor responde SEGURA; cualquier otra respuesta (INSEGURA, o que se ponga a explicar)
 * cuenta como «insegura». null si no se pudo preguntar (sin key, error HTTP o de red, vacía, tiempo agotado).
 */
export async function revisarFrase(
  frase: string,
  tema: string,
  key: string | undefined,
  buscar: Buscar = fetch,
  tiempoMax = TIEMPO_MAX_REVISOR_MS
): Promise<Veredicto | null> {
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
        model: MODELO_REVISOR,
        messages: [
          { role: "system", content: PROMPT_REVISOR },
          { role: "user", content: `Tema: ${tema}\nFrase del Diablo: ${frase}` },
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
    if (!respuesta) return null;
    return /^SEGURA\b/.test(respuesta) ? "segura" : "insegura";
  } catch {
    return null;
  }
}

/** Se añade al prompt del usuario para pedir otra frase al mismo modelo. */
export const INSTRUCCION_REHACER =
  "\n\nOJO: tu respuesta anterior empujaba al acto dañino o decía cómo hacerlo. Rehazla: tienta SOLO hacia algo inofensivo que dé el mismo gusto, búrlate del acto dañino, no lo recomiendes, no le quites importancia al riesgo y no digas cómo hacerlo.";

// Frases de respaldo con la voz del Diablo (≤ 35 palabras; el desenlace ≤ 20). Sin tema concreto a propósito.
const RESPALDO_TURNO = [
  "Hasta yo tengo límites, y ese plan cruza la raya. Mejor date un gusto que no te meta en líos: pizza, tu serie favorita y cero problemas mañana.",
  "Soy el Diablo, no un tonto: eso te sale caro. Te tiento con algo mejor, un capricho pequeño que disfrutes sin mirar por encima del hombro.",
  "Ni yo te empujo a eso. Mi oferta es otra: sal, date un antojo rico y deja ese plan donde está, que la buena tentación no deja cicatrices.",
];
const RESPALDO_DESENLACE = "Elegiste al Diablito, pero hasta él te mandó por el gusto sin líos. Tu yo de mañana respira.";

export function fraseSegura(esDesenlace: boolean, indice = 0): string {
  return esDesenlace ? RESPALDO_DESENLACE : RESPALDO_TURNO[Math.abs(indice) % RESPALDO_TURNO.length];
}

export type Cambio = "ninguno" | "rehecha" | "respaldo";

/** Orquesta la revisión. `rehacer` devuelve otra frase del mismo modelo, o null si no pudo. Nunca lanza. */
export async function conRevision(opts: {
  frase: string;
  revisar: (frase: string) => Promise<Veredicto | null>;
  rehacer: () => Promise<string | null>;
  esDesenlace: boolean;
  indice: number;
}): Promise<{ texto: string; cambio: Cambio }> {
  const primero = await opts.revisar(opts.frase);
  if (primero !== "insegura") return { texto: opts.frase, cambio: "ninguno" };

  let nueva: string | null = null;
  try {
    nueva = await opts.rehacer();
  } catch {
    nueva = null;
  }
  if (nueva && (await opts.revisar(nueva)) === "segura") return { texto: nueva, cambio: "rehecha" };
  return { texto: fraseSegura(opts.esDesenlace, opts.indice), cambio: "respaldo" };
}
