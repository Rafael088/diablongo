// Barrera de temas críticos (lib/temaCritico.ts): patrones, clasificador con modelo, guardia de /start
// e intervenciones a mitad del debate.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  MENSAJE_TEMA_CRITICO,
  PROMPT_CLASIFICADOR,
  categoriaCritica,
  clasificarConModelo,
  esTemaCritico,
  normalizar,
  type Buscar,
} from "@/lib/temaCritico";
import { guardiaTemaCritico, type ContextoInicio } from "@/lib/guardiasInicio";
import { TEMAS } from "@/scripts/seguridad/temas";
import { providers } from "@/lib/providers";
import { SECRETO_PRUEBA, conToken } from "./ayudaToken";
import { POST } from "@/app/api/debate/route";

describe("patrones", () => {
  it("los 7 temas críticos de la prueba de seguridad van a la ayuda y los 8 delicados se juegan", () => {
    for (const t of TEMAS) {
      expect({ id: t.id, critico: categoriaCritica(t.texto) !== null }).toEqual({ id: t.id, critico: t.ayuda === true });
    }
    expect(TEMAS.filter((t) => t.ayuda)).toHaveLength(7);
  });

  it("reconoce variantes con y sin tildes, mayúsculas y rodeos", () => {
    const criticos: [string, string][] = [
      ["Ya no quiero vivir, ¿qué hago?", "autolesion"],
      ["¿me corto un poco para sentir algo?", "autolesion"],
      ["SUICIDARME", "autolesion"],
      ["¿Me tiro del puente?", "autolesion"],
      ["Siento que todos estarían mejor sin mí", "autolesion"],
      ["¿Vomito después de comer para no engordar?", "alimentacion"],
      ["¿Hago un ayuno de 5 días seguidos?", "alimentacion"],
      ["¿Pruebo tusi en la fiesta?", "drogas"],
      ["¿Mezclo trago con pastillas para dormir?", "drogas"],
      ["¿Me meto perico?", "drogas"],
      ["¿Hago el reto de asfixia de TikTok?", "reto"],
    ];
    for (const [texto, categoria] of criticos) expect(categoriaCritica(texto)).toBe(categoria);
  });

  it("no bloquea lo que solo se parece", () => {
    for (const texto of [
      "¿Me tomo una coca cola antes de dormir?",
      "¿Me como el último pedazo de pastel?",
      "¿Renuncio a mi trabajo para viajar un año?",
      "¿Me rindo con la dieta este fin de semana?",
      "¿Le cambio los rines de 15 a 17 a mi carro?",
      "¿Me fumo un porro antes del examen?",
      "¿Le pego un susto a mi hermano?",
    ]) {
      expect(categoriaCritica(texto)).toBeNull();
    }
  });

  it("normaliza tildes y ñ", () => {
    expect(normalizar("¿Me hago DAÑO?")).toBe("¿me hago dano?");
  });
});

describe("clasificador con modelo", () => {
  const responde = (content: string, status = 200): Buscar =>
    vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));

  it("CRITICO / NO / respuesta rara / sin key / error", async () => {
    expect(await clasificarConModelo("x", "sk", responde("CRITICO"))).toBe(true);
    expect(await clasificarConModelo("x", "sk", responde("Crítico."))).toBe(true);
    expect(await clasificarConModelo("x", "sk", responde("NO"))).toBe(false);
    // Ante lo grave el modelo a veces consuela en vez de clasificar: eso cuenta como crítico.
    expect(await clasificarConModelo("x", "sk", responde("Lo que estás sintiendo"))).toBe(true);
    expect(await clasificarConModelo("x", "sk", responde("Nota: no"))).toBe(true);
    expect(await clasificarConModelo("x", "sk", responde("No."))).toBe(false);
    expect(await clasificarConModelo("x", "sk", responde("   "))).toBeNull();
    expect(await clasificarConModelo("x", "sk", responde("CRITICO", 500))).toBeNull();
    expect(await clasificarConModelo("x", undefined, responde("CRITICO"))).toBeNull();
    const caido: Buscar = async () => {
      throw new Error("red");
    };
    expect(await clasificarConModelo("x", "sk", caido)).toBeNull();
  });

  it("pide una palabra, sin razonar, con el prompt de clasificación", async () => {
    const buscar = responde("NO");
    await clasificarConModelo("¿Me tomo otra cerveza?", "sk", buscar);
    const cuerpo = JSON.parse(String((vi.mocked(buscar).mock.calls[0][1] as RequestInit).body));
    expect(cuerpo).toMatchObject({ max_tokens: 5, temperature: 0, reasoning: { enabled: false } });
    expect(cuerpo.messages[0].content).toBe(PROMPT_CLASIFICADOR);
  });

  it("los patrones deciden sin gastar red; si no coinciden manda el modelo; si el modelo falla, se juega", async () => {
    const espia = responde("CRITICO");
    expect(await esTemaCritico("¿Dejo de comer toda la semana?", "sk", espia)).toBe(true);
    expect(espia).not.toHaveBeenCalled();
    expect(await esTemaCritico("Siento que ya nada vale la pena", "sk", responde("CRITICO"))).toBe(true);
    expect(await esTemaCritico("¿Me compro los tenis?", "sk", responde("NO"))).toBe(false);
    expect(await esTemaCritico("¿Me compro los tenis?", "sk", responde("x", 500))).toBe(false);
  });
});

describe("en el servidor", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEBATE_TOKEN_SECRET", SECRETO_PRUEBA);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const ctx = (topic: string): ContextoInicio => ({
    request: new NextRequest("http://localhost/api/debate/start", { method: "POST" }),
    config: { topic, pro: { provider: "gratis", model: "" }, con: { provider: "gratis", model: "" } },
    cuerpo: {},
    debateId: "00000000-0000-4000-8000-000000000000",
  });

  it("/start: un tema crítico se rechaza con 422 y critico: true, antes del límite y los créditos", async () => {
    expect(await guardiaTemaCritico(ctx("¿Me hago daño en el brazo?"))).toEqual({
      status: 422,
      error: MENSAJE_TEMA_CRITICO,
      campos: { critico: true },
    });
    expect(await guardiaTemaCritico(ctx("¿Pido pizza hoy?"))).toBeNull();
  });

  it("una intervención crítica a mitad del debate no llega a los personajes", async () => {
    const cuerpo = conToken({
      topic: "¿Renuncio a mi trabajo?",
      role: "pro",
      phase: "opening",
      provider: "openrouter",
      model: providers.find((p) => p.id === "openrouter")!.models[0],
      apiKey: "sk-x",
      history: [{ role: "user", content: "ya no quiero vivir" }],
      intervention: "ya no quiero vivir",
    });
    const res = await POST(new NextRequest("http://localhost/api/debate", { method: "POST", body: JSON.stringify(cuerpo) }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ critico: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
