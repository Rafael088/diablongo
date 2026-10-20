import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TurnRequest, TurnResponse } from "@/types";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/debateEngine";
import { getProviderById } from "@/lib/providers";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: TurnRequest = await request.json();
    const { topic, role, phase, provider: providerId, model, apiKey, history, intervention } = body;

    if (!topic || !role || !providerId || !model) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const provider = getProviderById(providerId);
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 400 });
    }

    if (provider.requiresApiKey && !apiKey) {
      return NextResponse.json(
        { error: `API key required for ${provider.name}` },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(role);
    const userPrompt = buildUserPrompt(topic, role, phase, history, intervention);

    let content: string;

    switch (providerId) {
      case "gemini":
        content = await callGemini(model, apiKey, systemPrompt, userPrompt);
        break;
      case "openrouter":
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
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
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
  });

  const result = await geminiModel.generateContent(userPrompt);
  return result.response.text().trim() || "No response";
}
