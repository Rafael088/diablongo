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
import { MAX_CUERPO_BYTES } from "@/lib/topes";
import {
  TOPE_CON_RAZONAMIENTO,
  cuerpoChat,
  esOpenRouter,
  esRazonamientoObligatorio,
  leerRespuesta,
  textoUtil,
  type RespuestaChat,
} from "@/lib/openrouter";

const MENSAJE_RESPUESTA_CORTADA =
  "El modelo no terminó la frase (se quedó sin espacio). Vuelve a intentarlo o prueba otro modelo.";
import { MENSAJE_SIN_SECRETO, comprobarTurno, obtenerSecreto, verificarToken } from "@/lib/tokenDebate";
import { obtenerRegistroTurnos, type RegistroTurnos } from "@/lib/registroTurnos";
import { TOTAL_TURNS } from "@/lib/debateEngine";
import {
  AVISO_RESPALDO_CREDITOS,
  MENSAJE_CREDITOS_DEVUELTOS,
  MENSAJE_CREDITOS_NO_DISPONIBLE,
  PROVEEDOR_CREDITOS,
  elegirModeloCreditos,
} from "@/lib/creditosDebate";
import { devolverDebate } from "@/lib/creditos";
import { clienteAdmin } from "@/lib/supabase/admin";
import type { DebateRole } from "@/types";

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

    // Modo créditos: el debate ya se cobró en /start a la cuenta del token.
    const esCreditos = providerId === PROVEEDOR_CREDITOS;
    if (esCreditos) {
      const keyServidor = process.env.OPENROUTER_API_KEY;
      if (!permiso.payload.u) {
        return NextResponse.json({ error: "Este debate no se pagó con créditos." }, { status: 403 });
      }
      if (!keyServidor) {
        return NextResponse.json({ error: MENSAJE_CREDITOS_NO_DISPONIBLE }, { status: 503 });
      }
      apiKey = keyServidor;
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

    if (!["gemini", "openrouter", PROVEEDOR_GRATIS, PROVEEDOR_CREDITOS, "groq", "ollama"].includes(providerId)) {
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

    if (esCreditos) {
      // Cualquier fallo en un debate pagado (también una key del servidor rota) es nuestro: si pasa
      // en un turno del debate, se devuelve el crédito y el debate se cierra. El desenlace tiene
      // plantilla local en el cliente, así que si falla solo se libera el turno, sin devolver.
      const r = await conRespaldo(role, elegirModeloCreditos, provider.baseUrl!, apiKey, systemPrompt, userPrompt, {
        anteTodo: true,
        aviso: AVISO_RESPALDO_CREDITOS,
      });
      if (!r.ok) {
        console.error("Debate con créditos sin respuesta:", r.ultimo instanceof Error ? r.ultimo.message : r.ultimo);
        if (turno.indice >= TOTAL_TURNS) {
          await registro.liberar(debateId, turno.indice);
          return NextResponse.json({ error: MENSAJE_CREDITOS_NO_DISPONIBLE }, { status: 503 });
        }
        const devuelto = await anularYDevolver(registro, permiso.payload, turno.indice);
        return NextResponse.json(
          { error: devuelto ? MENSAJE_CREDITOS_DEVUELTOS : MENSAJE_CREDITOS_NO_DISPONIBLE, devuelto, terminado: true },
          { status: 503 }
        );
      }
      content = r.content;
      aviso = r.aviso;
    } else {
      try {
        if (providerId === "gemini") {
          content = await callGemini(model, apiKey, systemPrompt, userPrompt);
        } else if (providerId === PROVEEDOR_GRATIS) {
          // Respaldo en el servidor: si el modelo da 429 o se cae, se prueba el siguiente de la lista.
          // Es el mismo turno (mismo índice, mismo token): no gasta otra llamada del límite diario.
          const r = await conRespaldo(role, elegirModeloGratis, provider.baseUrl!, apiKey, systemPrompt, userPrompt, {
            anteTodo: false,
            aviso: AVISO_RESPALDO_GRATIS,
          });
          if (!r.ok) {
            console.error("Todos los modelos gratis fallaron:", r.ultimo);
            await registro.liberar(debateId, turno.indice);
            return NextResponse.json({ error: MENSAJE_GRATIS_AGOTADO }, { status: 503 });
          }
          content = r.content;
          aviso = r.aviso;
        } else {
          content = await callOpenAICompatible(provider.baseUrl!, model, apiKey, systemPrompt, userPrompt);
        }
      } catch (error) {
        // Sin respuesta del proveedor: el turno se devuelve para poder reintentarlo.
        await registro.liberar(debateId, turno.indice);
        throw error;
      }
    }

    const response: TurnResponse = aviso ? { content, aviso } : { content };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Debate API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type ResultadoRespaldo = { ok: true; content: string; aviso?: string } | { ok: false; ultimo: unknown };

/**
 * Prueba los modelos del personaje en orden hasta que uno responda. Pasa al siguiente ante 429,
 * 408, 5xx o caída de red; con `anteTodo`, ante cualquier error (modo créditos: el debate ya
 * está pagado y cualquier modelo de la lista sirve).
 */
async function conRespaldo(
  role: DebateRole,
  elegir: (rol: DebateRole, intento: number) => string | undefined,
  baseUrl: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opciones: { anteTodo: boolean; aviso: string }
): Promise<ResultadoRespaldo> {
  let ultimo: unknown;
  for (let intento = 0; ; intento++) {
    const candidato = elegir(role, intento);
    if (!candidato) return { ok: false, ultimo };
    try {
      const content = await callOpenAICompatible(baseUrl, candidato, apiKey, systemPrompt, userPrompt);
      return intento > 0 ? { ok: true, content, aviso: opciones.aviso } : { ok: true, content };
    } catch (error) {
      ultimo = error;
      if (!opciones.anteTodo && !esFalloDeModelo(error)) throw error;
      console.warn(`Modelo ${candidato} falló; probando el siguiente.`);
    }
  }
}

/**
 * Un debate pagado no pudo seguir: se cierran el turno que falló y los que quedaban (nadie
 * puede seguir jugándolo gratis después de la devolución) y se devuelve el crédito una vez.
 */
async function anularYDevolver(
  registro: RegistroTurnos,
  payload: { id: string; n: number; exp: number; u?: string },
  desde: number
): Promise<boolean> {
  for (let i = desde + 1; i < payload.n; i++) await registro.marcar(payload.id, i, payload.exp);
  const admin = clienteAdmin();
  if (!admin || !payload.u) return false;
  try {
    return (await devolverDebate(admin, payload.u, payload.id)).devuelto;
  } catch (error) {
    console.error("No se pudo devolver el crédito:", error instanceof Error ? error.message : "desconocido");
    return false;
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
  const openRouter = esOpenRouter(baseUrl);
  if (openRouter) {
    headers["HTTP-Referer"] = "https://agent-debate.vercel.app";
    headers["X-Title"] = "Agent Debate";
  }
  const ocultar = (t: string) => (apiKey ? t.split(apiKey).join("[oculta]") : t);

  // Primero con el razonamiento apagado (lib/openrouter.ts); si el modelo no lo permite, una vez
  // más sin el parámetro y con más margen.
  for (const razonamientoObligatorio of [false, true]) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(
          cuerpoChat({ modelo: model, system: systemPrompt, user: userPrompt, openRouter, razonamientoObligatorio })
        ),
      });
    } catch (error) {
      throw new ErrorDeModelo(error instanceof Error ? error.message : "error de red");
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (openRouter && !razonamientoObligatorio && esRazonamientoObligatorio(response.status, errorText)) continue;
      throw new ErrorDeModelo(`API error (${response.status}): ${ocultar(errorText)}`, response.status);
    }

    // Vacía o cortada sin una frase completa: cuenta como fallo del modelo (pasa al respaldo).
    const texto = leerRespuesta((await response.json()) as RespuestaChat);
    if (!texto) throw new ErrorDeModelo(MENSAJE_RESPUESTA_CORTADA);
    return texto;
  }
  throw new ErrorDeModelo(MENSAJE_RESPUESTA_CORTADA);
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
    // Los Gemini 3.x razonan y el razonamiento cuenta en el tope: margen amplio (la longitud la
    // manda el prompt) y, si aun así corta, se queda con las frases completas.
    generationConfig: { maxOutputTokens: TOPE_CON_RAZONAMIENTO },
  });

  const result = await geminiModel.generateContent(userPrompt);
  const fin = result.response.candidates?.[0]?.finishReason;
  const texto = textoUtil(result.response.text(), fin === "MAX_TOKENS" ? "length" : fin);
  if (!texto) throw new ErrorDeModelo(MENSAJE_RESPUESTA_CORTADA);
  return texto;
}
