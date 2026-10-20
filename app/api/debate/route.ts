import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TurnResponse } from "@/types";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompts";
import { validarTurno } from "@/lib/validarTurno";
import { MENSAJE_GRATIS_NO_DISPONIBLE, PROVEEDOR_GRATIS, elegirModeloGratis } from "@/lib/gratis";
import { MAX_CUERPO_BYTES, MAX_TOKENS_RESPUESTA } from "@/lib/topes";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const texto = await request.text();
    if (Buffer.byteLength(texto, "utf8") > MAX_CUERPO_BYTES) {
      return NextResponse.json(
        { error: "La petición es demasiado grande." },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(texto);
    } catch {
      return NextResponse.json({ error: "El cuerpo de la petición no es JSON." }, { status: 400 });
    }

    const validacion = validarTurno(body);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: validacion.status });
    }
    const { topic, role, phase, provider, history, intervention } = validacion.datos;
    let { model, apiKey } = validacion.datos;
    const providerId = provider.id;

    // Modo gratis: key y modelo los pone el servidor. Sin key, 503 y no se llama a nada.
    if (providerId === PROVEEDOR_GRATIS) {
      const keyServidor = process.env.OPENROUTER_API_KEY;
      const modeloGratis = elegirModeloGratis(role);
      if (!keyServidor || !modeloGratis) {
        return NextResponse.json({ error: MENSAJE_GRATIS_NO_DISPONIBLE }, { status: 503 });
      }
      apiKey = keyServidor;
      model = modeloGratis;
    }

    const systemPrompt = buildSystemPrompt(role);
    const userPrompt = buildUserPrompt(topic, role, phase, history, intervention);

    let content: string;

    switch (providerId) {
      case "gemini":
        content = await callGemini(model, apiKey, systemPrompt, userPrompt);
        break;
      case "openrouter":
      case PROVEEDOR_GRATIS:
      case "groq":
      case "ollama":
        content = await callOpenAICompatible(
          provider.baseUrl!,
          model,
          apiKey,
          systemPrompt,
          userPrompt
        );
        break;
      default:
        return NextResponse.json(
          { error: "Provider not implemented" },
          { status: 501 }
        );
    }

    const response: TurnResponse = { content };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Debate API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // OpenRouter requires an additional header
  if (baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://agent-debate.vercel.app";
    headers["X-Title"] = "Agent Debate";
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: MAX_TOKENS_RESPUESTA,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${apiKey ? errorText.split(apiKey).join("[oculta]") : errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "No response";
}

async function callGemini(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: MAX_TOKENS_RESPUESTA },
  });

  const result = await geminiModel.generateContent(userPrompt);
  return result.response.text().trim() || "No response";
}
