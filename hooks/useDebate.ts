"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { DebateConfig, DebateMessage, DebateRole } from "@/types";
import {
  TOTAL_TURNS,
  canIntervene,
  countTurnsPlayed,
  getTurn,
  pendingIntervention,
} from "@/lib/debateEngine";
import { accionTrasLeer } from "@/lib/avance";
import { saveDebate } from "@/lib/storage";
import { categoriaCritica } from "@/lib/temaCritico";

/** El servidor dijo que el tema (o lo que escribió la persona) es crítico: se muestra ayuda, no se juega. */
class TemaCritico extends Error {}
import {
  TIEMPO_MAX_DESENLACE_MS,
  limpiarDesenlace,
  plantillaDesenlace,
} from "@/lib/desenlace";

export type DebateStatus = "idle" | "running" | "paused" | "finished";

export interface GenerateArgs {
  speaker: DebateRole;
  phase: string;
  round: number;
  history: DebateMessage[];
  intervention?: string;
}

/** Quien genera el texto de un turno (por defecto, el servidor). */
export type GenerateTurn = (args: GenerateArgs) => Promise<string>;

interface UseDebateOptions {
  /** Sustituye la llamada al servidor (modo demo). */
  generate?: GenerateTurn;
  /** Mensajes ya dichos al empezar (demo congelada). */
  initialMessages?: DebateMessage[];
  initialStatus?: DebateStatus;
  /** Si es false no se guarda el debate al terminar. */
  persist?: boolean;
  /** Token de Turnstile (de un solo uso) para /api/debate/start. */
  turnstile?: string;
  /** Sin la pausa de intervención de la mitad (repetición de un reto: ahí nadie interviene). */
  sinPausa?: boolean;
}

/**
 * Bucle de turnos del debate. El siguiente turno no arranca hasta que la
 * pantalla avisa con `textRead()` de que el texto se escribió y la persona
 * pulsa «Siguiente» (`siguiente()`), salvo en la pausa de intervención y el final.
 */
export function useDebate(config: DebateConfig, options: UseDebateOptions = {}) {
  const { generate, initialMessages, initialStatus = "idle", persist = true, turnstile, sinPausa = false } = options;
  const [messages, setMessages] = useState<DebateMessage[]>(initialMessages ?? []);
  const [status, setStatus] = useState<DebateStatus>(initialStatus);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Tema crítico (lib/temaCritico.ts): la arena cambia el debate por la pantalla de ayuda.
  const [ayuda, setAyuda] = useState(false);
  // Frase leída y turno siguiente retenido hasta que la persona pulse «Siguiente».
  const [esperandoSiguiente, setEsperandoSiguiente] = useState(false);
  const esperandoRef = useRef(false);

  const pendingRef = useRef(false);
  const messagesRef = useRef<DebateMessage[]>(initialMessages ?? []);
  const statusRef = useRef<DebateStatus>(initialStatus);
  const runNextTurnRef = useRef<() => void>(() => {});
  const textDoneRef = useRef(true);
  const readGateRef = useRef<(() => void) | null>(null);
  // Token del debate (de /api/debate/start). Solo en memoria: nunca en storage.
  const tokenRef = useRef<string | null>(null);
  // Token de Turnstile: se usa una sola vez; si /start lo gasta, no se reenvía.
  const turnstileRef = useRef<string | undefined>(turnstile);

  // El estado y su ref cambian siempre juntos (los refs no se tocan al renderizar).
  const updateStatus = useCallback((next: DebateStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** La pantalla avisa: el texto actual ya se escribió (o se saltó). */
  const textRead = useCallback(() => {
    textDoneRef.current = true;
    readGateRef.current?.();
    readGateRef.current = null;
  }, []);

  const waitUntilRead = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (textDoneRef.current) resolve();
        else readGateRef.current = resolve;
      }),
    []
  );

  const fijarEspera = useCallback((valor: boolean) => {
    esperandoRef.current = valor;
    setEsperandoSiguiente(valor);
  }, []);

  /** Pide el token del debate la primera vez; si /start falla, lanza su mensaje. */
  const asegurarToken = useCallback(async (): Promise<string> => {
    if (tokenRef.current) return tokenRef.current;
    const verificacion = turnstileRef.current;
    turnstileRef.current = undefined;
    const response = await fetch("/api/debate/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: config.topic,
        pro: { provider: config.pro.provider, model: config.pro.model, personalidad: config.pro.personalidad },
        con: { provider: config.con.provider, model: config.con.model, personalidad: config.con.personalidad },
        turnstile: verificacion,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (data.critico === true) throw new TemaCritico(data.error);
    if (!response.ok || typeof data.token !== "string") {
      throw new Error(data.error || `Error ${response.status}`);
    }
    tokenRef.current = data.token;
    return data.token;
  }, [config]);

  const executeTurn = useCallback(
    async (speaker: DebateRole, phase: string, round: number, indice: number): Promise<boolean> => {
      const debater = speaker === "pro" ? config.pro : config.con;
      setThinking(true);
      setError(null);
      setAviso(null);

      try {
        // Lo que el usuario dijo y este personaje aún no contestó (va también en el historial).
        const intervention = pendingIntervention(messagesRef.current, speaker);
        let content: string;
        if (generate) {
          content = await generate({
            speaker,
            phase,
            round,
            history: messagesRef.current,
            intervention,
          });
        } else {
          const token = await asegurarToken();
          const response = await fetch("/api/debate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              indice,
              topic: config.topic,
              role: speaker,
              phase,
              provider: debater.provider,
              model: debater.model,
              apiKey: debater.apiKey,
              history: messagesRef.current,
              intervention,
            }),
          });

          if (!response.ok) {
            // Permiso caducado o inválido: al reanudar se pide uno nuevo.
            if (response.status === 401) tokenRef.current = null;
            const data = await response.json().catch(() => ({}));
            if (data.critico === true) throw new TemaCritico(data.error);
            throw new Error(data.error || `Error ${response.status}`);
          }

          const datos = await response.json();
          content = datos.content;
          if (typeof datos.aviso === "string") setAviso(datos.aviso);
        }

        const newMessage: DebateMessage = {
          role: speaker,
          content,
          round,
          phase: phase as DebateMessage["phase"],
        };

        const updated = [...messagesRef.current, newMessage];
        textDoneRef.current = false;
        setMessages(updated);
        messagesRef.current = updated;
        setThinking(false);
        return true;
      } catch (err) {
        if (err instanceof TemaCritico) {
          setAyuda(true);
          setThinking(false);
          updateStatus("paused");
          pendingRef.current = false;
          return false;
        }
        const message = err instanceof Error ? err.message : "Error desconocido";
        setError(message);
        setThinking(false);
        updateStatus("paused");
        pendingRef.current = false;
        return false;
      }
    },
    [asegurarToken, config, generate, updateStatus]
  );

  const runNextTurn = useCallback(async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;

    const turnsDone = countTurnsPlayed(messagesRef.current);
    const turn = getTurn(turnsDone);
    if (!turn) {
      pendingRef.current = false;
      return;
    }

    // La intervención ya está en el historial y executeTurn la manda a este
    // personaje si aún no la contestó: no suma llamadas.
    const success = await executeTurn(turn.nextSpeaker, turn.phase, turn.round, turn.index);

    if (!success) {
      pendingRef.current = false;
      return;
    }

    // Que se pueda leer: nada avanza hasta que el texto termine de escribirse.
    await waitUntilRead();

    const done = countTurnsPlayed(messagesRef.current);
    const accion = accionTrasLeer(done);

    if (accion === "terminar") {
      updateStatus("finished");
      pendingRef.current = false;
      if (persist) {
        saveDebate({
          id: Date.now().toString(),
          topic: config.topic,
          totalTurns: TOTAL_TURNS,
          currentRound: turn.round,
          messages: messagesRef.current,
          status: "finished" as const,
        });
      }
      return;
    }

    pendingRef.current = false;

    if (accion === "pausar" && !sinPausa) {
      // Mitad del debate: pausa para que el usuario pueda intervenir.
      updateStatus("paused");
      return;
    }

    // Tiempo de leer y de dar 👍: el siguiente turno espera a `siguiente()`.
    if (statusRef.current === "running") fijarEspera(true);
  }, [config.topic, executeTurn, fijarEspera, persist, sinPausa, updateStatus, waitUntilRead]);

  useEffect(() => {
    runNextTurnRef.current = runNextTurn;
  }, [runNextTurn]);

  /** «Siguiente»: la persona ya leyó; se pide el turno que estaba retenido. */
  const siguiente = useCallback(() => {
    if (!esperandoRef.current || statusRef.current !== "running") return;
    fijarEspera(false);
    runNextTurnRef.current();
  }, [fijarEspera]);

  const play = useCallback(() => {
    fijarEspera(false);
    updateStatus("running");
    setTimeout(() => runNextTurnRef.current(), 100);
  }, [fijarEspera, updateStatus]);

  const pause = useCallback(() => updateStatus("paused"), [updateStatus]);

  // La intervención no llama al modelo: queda en el historial como mensaje del
  // usuario y el siguiente turno de cada personaje le responde.
  const intervene = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || !canIntervene(countTurnsPlayed(messagesRef.current))) return;
    if (categoriaCritica(clean)) {
      // Lo crítico no se le pasa a los personajes: pantalla de ayuda.
      setAyuda(true);
      return;
    }
    const userMessage: DebateMessage = {
      role: "user",
      content: clean,
      round: getTurn(countTurnsPlayed(messagesRef.current))?.round ?? 0,
      phase: "intervention",
    };
    const updated = [...messagesRef.current, userMessage];
    messagesRef.current = updated;
    setMessages(updated);
  }, []);

  const stop = useCallback(() => {
    pendingRef.current = false;
    statusRef.current = "idle";
    tokenRef.current = null;
    esperandoRef.current = false;
  }, []);

  /**
   * LLAMADA 9: el personaje elegido escribe el desenlace de la tarjeta. Si
   * falla, viene vacío o tarda más de TIEMPO_MAX_DESENLACE_MS, devuelve la
   * plantilla local. Nunca lanza error y no toca los mensajes del debate.
   */
  const pedirDesenlace = useCallback(
    async (elegido: DebateRole): Promise<string> => {
      const debater = elegido === "pro" ? config.pro : config.con;
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), TIEMPO_MAX_DESENLACE_MS);
      const limite = new Promise<never>((_, rechazar) => {
        control.signal.addEventListener("abort", () => rechazar(new Error("tiempo")));
      });
      try {
        const pedir = async (): Promise<string> => {
          if (generate) {
            return generate({
              speaker: elegido,
              phase: "desenlace",
              round: 4,
              history: messagesRef.current,
            });
          }
          const token = tokenRef.current;
          if (!token) throw new Error("sin token");
          const response = await fetch("/api/debate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: control.signal,
            body: JSON.stringify({
              token,
              indice: TOTAL_TURNS,
              topic: config.topic,
              role: elegido,
              phase: "desenlace",
              provider: debater.provider,
              model: debater.model,
              apiKey: debater.apiKey,
              history: messagesRef.current,
            }),
          });
          if (!response.ok) throw new Error(`Error ${response.status}`);
          return (await response.json()).content;
        };
        const texto = limpiarDesenlace(await Promise.race([pedir(), limite]));
        if (!texto || texto === "No response") throw new Error("vacío");
        return texto;
      } catch {
        return plantillaDesenlace(config.topic, elegido);
      } finally {
        clearTimeout(reloj);
      }
    },
    [config, generate]
  );

  return { messages, status, thinking, error, aviso, ayuda, esperandoSiguiente, siguiente, play, pause, intervene, textRead, stop, pedirDesenlace };
}
