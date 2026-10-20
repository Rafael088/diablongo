import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TurnResponse } from "@/types";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompts";
import { esObjeto, validarTurno } from "@/lib/validarTurno";
import {
  AVISO_RESPALDO_GRATIS,
  MENSAJE_GRATIS_AGOTADO,
  MENSAJE_GRATIS_NO_DISPONIBLE,
  PROVEEDOR_GRATIS,
  elegirModeloGratis,
  ErrorDeModelo,
  esFalloDeModelo,
} from "@/lib/gratis";
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
    let aviso: string | undefined;
    try {
      if (providerId === "gemini") {
        content = await callGemini(model, apiKey, systemPrompt, userPrompt);
      } else if (providerId === PROVEEDOR_GRATIS) {
        // Respaldo en el servidor: si el modelo da 429 o se cae, se prueba el siguiente de la lista.
        // Es el mismo turno (mismo índice, mismo token): no gasta otra llamada del límite diario.
        content = "";
        let ultimo: unknown;
        let resuelto = false;
        for (let intento = 0; ; intento++) {
          const candidato = elegirModeloGratis(role, intento);
          if (!candidato) break;
          try {
            content = await callOpenAICompatible(provider.baseUrl!, candidato, apiKey, systemPrompt, userPrompt);
            resuelto = true;
            if (intento > 0) aviso = AVISO_RESPALDO_GRATIS;
            break;
          } catch (error) {
            ultimo = error;
            if (!esFalloDeModelo(error)) throw error;
            console.warn(`Modelo gratis ${candidato} falló; probando el siguiente.`);
          }
        }
        if (!resuelto) {
          console.error("Todos los modelos gratis fallaron:", ultimo);
          await registro.liberar(debateId, turno.indice);
          return NextResponse.json({ error: MENSAJE_GRATIS_AGOTADO }, { status: 503 });
        }
      } else {
        content = await callOpenAICompatible(provider.baseUrl!, model, apiKey, systemPrompt, userPrompt);
      }
    } catch (error) {
      // Sin respuesta del proveedor: el turno se devuelve para poder reintentarlo.
      await registro.liberar(debateId, turno.indice);
      throw error;
    }

    const response: TurnResponse = aviso ? { content, aviso } : { content };
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

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
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
  } catch (error) {
    throw new ErrorDeModelo(error instanceof Error ? error.message : "error de red");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new ErrorDeModelo(
      `API error (${response.status}): ${apiKey ? errorText.split(apiKey).join("[oculta]") : errorText}`,
      response.status
    );
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
