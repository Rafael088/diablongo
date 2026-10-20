import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TurnResponse } from "@/types";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompts";
import { esObjeto, validarTurno } from "@/lib/validarTurno";
import { MENSAJE_GRATIS_NO_DISPONIBLE, PROVEEDOR_GRATIS, elegirModeloGratis } from "@/lib/gratis";
import { MAX_CUERPO_BYTES, MAX_TOKENS_RESPUESTA } from "@/lib/topes";
import { MENSAJE_SIN_SECRETO, comprobarTurno, obtenerSecreto, verificarToken } from "@/lib/tokenDebate";
import { obtenerRegistroTurnos } from "@/lib/registroTurnos";

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

    if (!esObjeto(body)) {
      return NextResponse.json({ error: "El cuerpo de la petición no es válido." }, { status: 400 });
    }
    // Token del debate (emitido por /api/debate/start): sin él no se juega ningún turno.
    const secreto = obtenerSecreto();
    if (!secreto) {
      return NextResponse.json({ error: MENSAJE_SIN_SECRETO }, { status: 503 });
    }
    const cuerpo = body;
    const permiso = verificarToken(cuerpo.token, secreto);
    if (!permiso.ok) {
      return NextResponse.json({ error: permiso.error }, { status: 401 });
    }

    const validacion = validarTurno(body);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: validacion.status });
    }
    const { topic, role, phase, provider, history, intervention } = validacion.datos;
    let { model, apiKey } = validacion.datos;
    const providerId = provider.id;

    // El turno tiene que caber en el plan del debate y ser del mismo tema/proveedor/modelo.
    const turno = comprobarTurno(
      permiso.payload,
      secreto,
      { topic, role, phase, provider: providerId, model },
      cuerpo.indice
    );
    if (!turno.ok) {
      return NextResponse.json({ error: turno.error }, { status: turno.status });
    }

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

    if (!["gemini", "openrouter", PROVEEDOR_GRATIS, "groq", "ollama"].includes(providerId)) {
      return NextResponse.json({ error: "Provider not implemented" }, { status: 501 });
    }

    // Último paso antes de gastar: el índice se consume una sola vez (409 si se repite).
    const registro = obtenerRegistroTurnos();
    const debateId = permiso.payload.id;
    if (!(await registro.marcar(debateId, turno.indice, permiso.payload.exp))) {
      return NextResponse.json({ error: "Ese turno del debate ya se jugó." }, { status: 409 });
    }

    const systemPrompt = buildSystemPrompt(role);
    const userPrompt = buildUserPrompt(topic, role, phase, history, intervention);

    let content: string;
    try {
      content =
        providerId === "gemini"
          ? await callGemini(model, apiKey, systemPrompt, userPrompt)
          : await callOpenAICompatible(provider.baseUrl!, model, apiKey, systemPrompt, userPrompt);
    } catch (error) {
      // Sin respuesta del proveedor: el turno se devuelve para poder reintentarlo.
      await registro.liberar(debateId, turno.indice);
      throw error;
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
