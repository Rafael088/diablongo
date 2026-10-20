"use client";

import { useEffect, useState } from "react";
import { DebateConfig, DebateMessage, DebateRole } from "@/types";
import { TOTAL_TURNS, canIntervene, countTurnsPlayed, getTurn } from "@/lib/debateEngine";
import { useDebate, type DebateStatus, type GenerateTurn } from "@/hooks/useDebate";
import { useTypewriter } from "@/hooks/useTypewriter";
import type { FotogramaSprite, PersonajeSprite } from "@/lib/sprites";
import PixelSprite from "./PixelSprite";
import SummaryPanel from "./SummaryPanel";

interface DebateArenaProps {
  config: DebateConfig;
  onReset: () => void;
  /** Modo demo: texto fijo en lugar de llamar al servidor. */
  generate?: GenerateTurn;
  initialMessages?: DebateMessage[];
  initialStatus?: DebateStatus;
  /** Texto completo sin efecto de máquina de escribir (capturas). */
  instant?: boolean;
  persist?: boolean;
}

const NOMBRES: Record<DebateRole | "user", string> = {
  pro: "Ángel",
  con: "Diablo",
  user: "Tú",
};

const PERSONAJE: Record<DebateRole | "user", PersonajeSprite> = {
  pro: "pro",
  con: "con",
  user: "usuario",
};

function Personaje({
  quien,
  fotograma,
  activo,
}: {
  quien: DebateRole | "user";
  fotograma: FotogramaSprite;
  activo: boolean;
}) {
  return (
    <div className={`arena-personaje ${activo ? "" : "arena-apagado"}`}>
      <PixelSprite
        personaje={PERSONAJE[quien]}
        fotograma={fotograma}
        escala={4}
        className="w-full h-auto"
      />
      <span className={`arena-nombre arena-nombre-${quien}`}>{NOMBRES[quien]}</span>
    </div>
  );
}

export default function DebateArena({
  config,
  onReset,
  generate,
  initialMessages,
  initialStatus,
  instant = false,
  persist = true,
}: DebateArenaProps) {
  const debate = useDebate(config, { generate, initialMessages, initialStatus, persist });
  const { messages, status, thinking, error, textRead } = debate;
  const [interventionText, setInterventionText] = useState("");

  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  const turnsPlayed = countTurnsPlayed(messages);
  const nextSpeaker = getTurn(turnsPlayed)?.nextSpeaker ?? null;

  // Frase que se muestra en la caja: la última dicha por un personaje, o la
  // intervención del usuario recién hecha.
  const lineText = thinking ? "..." : last?.content ?? "";
  const { shown, done, skip } = useTypewriter(lineText, instant || thinking);

  useEffect(() => {
    if (done && !thinking) textRead();
  }, [done, thinking, lineText, textRead]);

  // Clic o tecla para completar la frase al instante.
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, skip]);

  const waitingIntervention =
    status === "paused" &&
    !error &&
    done &&
    !thinking &&
    last?.role !== "user" &&
    turnsPlayed === 4 &&
    canIntervene(turnsPlayed);

  const speaker: DebateRole | "user" | null = thinking
    ? nextSpeaker
    : last && status !== "idle"
      ? (last.role as DebateRole | "user")
      : null;
  const finished = status === "finished";
  const hablando = !finished && speaker !== null && !done;
  // Alterna reposo/hablar según se escribe, para simular la boca.
  const bocaAbierta = hablando && Math.floor(shown.length / 3) % 2 === 0;
  const habla: FotogramaSprite = bocaAbierta || (speaker !== null && thinking) ? "hablar" : "reposo";

  const frameDe = (quien: DebateRole): FotogramaSprite =>
    !finished && speaker === quien ? habla : "reposo";
  const frameUsuario: FotogramaSprite = waitingIntervention
    ? "pensar"
    : !finished && last?.role === "user" && speaker === "user"
      ? "decidir"
      : "reposo";

  const handleReset = () => {
    debate.stop();
    onReset();
  };

  const decir = () => {
    const text = interventionText.trim();
    if (!text) return;
    debate.intervene(text);
    setInterventionText("");
    debate.play();
  };

  if (finished && done) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <SummaryPanel messages={messages} topic={config.topic} onNewDebate={handleReset} />
      </div>
    );
  }

  const cajaClicable = !done;
  const nombreCaja = speaker ? NOMBRES[speaker] : "";

  return (
    <div className="arena w-full max-w-3xl mx-auto">
      <div className="text-center mb-3">
        <h2 className="arena-titulo">{config.topic}</h2>
        <p className="arena-sub">
          Turno {Math.min(turnsPlayed + (thinking ? 1 : 0), TOTAL_TURNS)} de {TOTAL_TURNS}
        </p>
      </div>

      <div className="arena-escenario">
        <Personaje quien="pro" fotograma={frameDe("pro")} activo={speaker === null || speaker === "pro"} />
        <Personaje quien="user" fotograma={frameUsuario} activo={speaker === null || speaker === "user" || waitingIntervention} />
        <Personaje quien="con" fotograma={frameDe("con")} activo={speaker === null || speaker === "con"} />
      </div>

      <div
        className="caja-dialogo"
        onClick={cajaClicable ? skip : undefined}
        role="region"
        aria-live="polite"
        aria-label="Cuadro de diálogo"
      >
        {status === "idle" && !last ? (
          <div className="caja-centro">
            <p>* El Ángel y el Diablo esperan para debatir.</p>
            <button className="caja-boton" onClick={debate.play}>
              Iniciar
            </button>
          </div>
        ) : (
          <>
            {nombreCaja && <div className={`caja-nombre arena-nombre-${speaker}`}>{nombreCaja}</div>}
            <p className="caja-texto">
              {shown}
              {!done && <span className="caja-cursor" aria-hidden="true" />}
            </p>
            {done && !thinking && !waitingIntervention && !error && status === "running" && (
              <span className="caja-flecha" aria-hidden="true">▼</span>
            )}
          </>
        )}

        {error && (
          <p className="caja-error">
            Error: {error}{" "}
            <button className="caja-boton" onClick={debate.play}>
              Reintentar
            </button>
          </p>
        )}

        {waitingIntervention && (
          <div className="caja-intervencion">
            <p className="caja-pregunta">* ¿Quieres decirles algo?</p>
            <input
              type="text"
              value={interventionText}
              onChange={(e) => setInterventionText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && decir()}
              placeholder="Escribe tu mensaje..."
              aria-label="Tu mensaje para el Ángel y el Diablo"
              className="caja-campo"
            />
            <div className="caja-botones">
              <button className="caja-boton" onClick={decir} disabled={!interventionText.trim()}>
                Decir
              </button>
              <button className="caja-boton" onClick={debate.play}>
                Seguir
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="arena-barra">
        {(status === "running" || status === "paused") && !waitingIntervention && !error && (
          <button className="arena-enlace" onClick={status === "running" ? debate.pause : debate.play}>
            {status === "running" ? "Pausar" : "Continuar"}
          </button>
        )}
        <button className="arena-enlace" onClick={handleReset}>
          Reiniciar
        </button>
      </div>

      <details className="arena-historial">
        <summary>Historial ({messages.length})</summary>
        {messages.length === 0 ? (
          <p className="arena-vacio">Todavía no se ha dicho nada.</p>
        ) : (
          <ol>
            {messages.map((m, i) => (
              <li key={i}>
                <strong className={`arena-nombre-${m.role}`}>{NOMBRES[m.role]}:</strong> {m.content}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}
