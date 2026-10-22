"use client";

import PixelSprite from "@/components/PixelSprite";
import PantallaAyuda from "./PantallaAyuda";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { Bando } from "./PersonajeAnimado";
import { DebateConfig, DebateMessage, DebateRole } from "@/types";
import { TOTAL_TURNS, canIntervene, countTurnsPlayed, getTurn } from "@/lib/debateEngine";
import { useDebate, type DebateStatus, type GenerateTurn } from "@/hooks/useDebate";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useSoundEnabled, setSoundEnabled } from "@/hooks/useSoundEnabled";
import { useMarcador, sumarMarcador, borrarMarcador } from "@/hooks/useMarcador";
import { tituloSegunRecord } from "@/lib/marcador";
import { blipAlAvanzar, getBaseFrequency, playBlip } from "@/lib/blips";
import type { FotogramaSprite, PersonajeSprite } from "@/lib/sprites";
import PersonajeAnimado from "./PersonajeAnimado";
import { MINIMO, TOPE, quienGana, textoGanando, valorDeVotos, type Ganando } from "@/lib/tentacion";
import TarjetaDesenlace from "./TarjetaDesenlace";
import { teclaAvanza } from "@/lib/avance";
import { MAX_INTERVENCION } from "@/lib/topes";

interface DebateArenaProps {
  config: DebateConfig;
  onReset: () => void;
  /** Token de Turnstile para /api/debate/start (un solo uso). */
  turnstile?: string;
  /** Modo demo: texto fijo en lugar de llamar al servidor. */
  generate?: GenerateTurn;
  initialMessages?: DebateMessage[];
  initialStatus?: DebateStatus;
  /** Texto completo sin efecto de máquina de escribir (capturas). */
  instant?: boolean;
  persist?: boolean;
  /** Quien ganó: dispara la victoria (halo del Ángel o risa y fuego del Diablo). */
  ganador?: Bando;
  /** Congela el golpe sobre este personaje (capturas y demo). */
  golpeFijo?: Bando;
  /** Índices de mensajes que ya llevan 👍 al empezar (demo y capturas). */
  votosIniciales?: number[];
  /** Avisa de quién va ganando en la barra de tentación y su valor (-100 a 100). */
  onTentacionChange?: (estado: { valor: number; ganando: Ganando }) => void;
  /** Demo y capturas: arranca con esta elección ya hecha y su desenlace fijo. */
  eleccionInicial?: Bando;
  desenlaceInicial?: string;
  /** Capturas: la tarjeta escribe su PNG real en la página. */
  volcadoTarjeta?: boolean;
}

// Botones finales con las frases del ejemplo de interfaz del tablero de marca.
const ELECCION: Record<"pro" | "con", { titulo: string; detalle: string }> = {
  pro: { titulo: "Escucha al angelito", detalle: "(Es la decisión inteligente)" },
  con: { titulo: "Dale al diablongo", detalle: "(La vida es corta)" },
};

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

export default function DebateArena({
  config,
  onReset,
  turnstile,
  generate,
  initialMessages,
  initialStatus,
  instant = false,
  persist = true,
  ganador: ganadorProp,
  golpeFijo,
  votosIniciales,
  onTentacionChange,
  eleccionInicial,
  desenlaceInicial,
  volcadoTarjeta = false,
}: DebateArenaProps) {
  const debate = useDebate(config, { generate, initialMessages, initialStatus, persist, turnstile });
  const { messages, status, thinking, error, aviso, textRead, esperandoSiguiente, siguiente } = debate;
  const [interventionText, setInterventionText] = useState("");
  const soundEnabled = useSoundEnabled();
  const marcador = useMarcador();
  const prevBlipRef = useRef({ text: "", count: 0 });
  const quieto = useReducedMotion() ?? false;
  // Pantalla final: a quién hizo caso el usuario y el desenlace de la tarjeta.
  const [eleccion, setEleccion] = useState<Bando | null>(eleccionInicial ?? null);
  const [desenlace, setDesenlace] = useState<string | null>(desenlaceInicial ?? null);
  const ganadorFinal: Bando | undefined = ganadorProp ?? eleccion ?? undefined;
  // Votos 👍 por índice de mensaje.
  const [votos, setVotos] = useState<number[]>(votosIniciales ?? []);

  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  const turnsPlayed = countTurnsPlayed(messages);
  const nextSpeaker = getTurn(turnsPlayed)?.nextSpeaker ?? null;

  // Frase que se muestra en la caja: la última dicha por un personaje, o la
  // intervención del usuario recién hecha.
  const lineText = thinking ? "..." : last?.content ?? "";
  const { shown, count, done, skip } = useTypewriter(lineText, instant || thinking);

  useEffect(() => {
    if (done && !thinking) textRead();
  }, [done, thinking, lineText, textRead]);

  // Toca blips mientras se escribe (cada 2 letras).
  // Ignora espacios y puntuación, y no toca si thinking o instant.
  useEffect(() => {
    // Si la frase cambió, se cuenta desde cero; un skip salta de golpe y no suena.
    const prev = prevBlipRef.current.text === lineText ? prevBlipRef.current.count : 0;
    prevBlipRef.current = { text: lineText, count };

    if (!soundEnabled || thinking || instant || !last) return;
    const speaker = last.role as DebateRole | "user";
    if (speaker !== "pro" && speaker !== "con") return;

    if (blipAlAvanzar(lineText, prev, count)) {
      playBlip(getBaseFrequency(speaker), 50, 0.05);
    }
  }, [count, soundEnabled, thinking, instant, last, lineText]);

  // Enter o espacio: completa la frase si se está escribiendo; si ya se leyó, pasa a la siguiente.
  // No actúan sobre campos, botones ni enlaces (cada uno tiene su propia acción).
  useEffect(() => {
    if (done && !esperandoSiguiente) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !teclaAvanza(e.key, e.target as HTMLElement | null)) return;
      e.preventDefault();
      if (!done) skip();
      else siguiente();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, esperandoSiguiente, skip, siguiente]);

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
    ganadorFinal === quien
      ? "victoria"
      : golpe === quien
        ? "golpe"
        : !finished && speaker === quien
          ? habla
          : "reposo";
  const frameUsuario: FotogramaSprite = waitingIntervention
    ? "pensar"
    : !finished && last?.role === "user" && speaker === "user"
      ? "decidir"
      : "reposo";

  // Refutado: al empezar a hablar el otro en una refutación o última palabra,
  // quien recibe la réplica pone cara de golpe un momento.
  const claveGolpe =
    !thinking && !finished && last && last.role !== "user" && last.phase !== "opening"
      ? messages.length
      : 0;
  const [claveVista, setClaveVista] = useState(claveGolpe);
  const [golpeado, setGolpeado] = useState<Bando | null>(null);
  if (claveGolpe !== claveVista) {
    setClaveVista(claveGolpe);
    if (claveGolpe > 0 && last) setGolpeado(last.role === "pro" ? "con" : "pro");
  }
  useEffect(() => {
    if (!golpeado) return;
    const t = setTimeout(() => setGolpeado(null), 900);
    return () => clearTimeout(t);
  }, [golpeado]);
  const golpe: Bando | null = golpeFijo ?? golpeado;

  const valorBarra = valorDeVotos(
    messages.map((m) => m.role),
    votos,
  );
  const ganando = quienGana(valorBarra);
  useEffect(() => {
    onTentacionChange?.({ valor: valorBarra, ganando });
  }, [valorBarra, ganando, onTentacionChange]);

  const votar = (i: number) => setVotos((v) => (v.includes(i) ? v : [...v, i]));
  const puedeVotar = (i: number) => {
    const r = messages[i]?.role;
    return (r === "pro" || r === "con") && !votos.includes(i);
  };
  const etiquetaVoto = (i: number) => {
    const r = messages[i]?.role === "con" ? "con" : "pro";
    return votos.includes(i)
      ? `Ya diste 👍 a ${NOMBRES[r]}`
      : `Dar 👍 a esta frase: apoyas al ${NOMBRES[r]}`;
  };
  const ultimoIdx = messages.length - 1;
  const mostrarVoto =
    !thinking && done && last !== null && (last.role === "pro" || last.role === "con");
  const posBarra = ((valorBarra - MINIMO) / (TOPE - MINIMO)) * 100;

  const handleReset = () => {
    debate.stop();
    onReset();
  };

  if (debate.ayuda) return <PantallaAyuda onVolver={handleReset} />;

  const decir = () => {
    const text = interventionText.trim();
    if (!text) return;
    debate.intervene(text);
    setInterventionText("");
    debate.play();
  };

  const enFinal = finished && done;
  const elegir = async (quien: Bando) => {
    if (eleccion) return;
    setEleccion(quien);
    // Suma al marcador solo si no es demo (persist !== false).
    if (persist !== false) {
      sumarMarcador(quien);
    }
    // LLAMADA 9 (o plantilla local si falla o tarda); la caja muestra "..." mientras tanto.
    setDesenlace(await debate.pedirDesenlace(quien));
  };

  const alHacerClicEnCaja = enFinal ? undefined : !done ? skip : esperandoSiguiente ? siguiente : undefined;
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
        {(["pro", "user", "con"] as const).map((quien) => (
          <PersonajeAnimado
            key={quien}
            personaje={PERSONAJE[quien]}
            fotograma={quien === "user" ? frameUsuario : frameDe(quien)}
            nombre={NOMBRES[quien]}
            claseNombre={`arena-nombre-${quien}`}
            activo={
              ganadorFinal
                ? ganadorFinal === quien
                : speaker === null ||
                  speaker === quien ||
                  (quien === "user" && waitingIntervention)
            }
            desfase={quien === "pro" ? 0 : quien === "user" ? 0.9 : 1.7}
            golpeado={golpe === quien}
            golpeQuieto={golpeFijo === quien}
            victorioso={ganadorFinal === quien}
          />
        ))}
      </div>

      <div className="barra-tentacion">
        <span className="barra-extremo barra-extremo-pro" aria-hidden="true">😇</span>
        <div
          className="barra-pista"
          role="meter"
          aria-label="Barra de tentación"
          aria-valuemin={MINIMO}
          aria-valuemax={TOPE}
          aria-valuenow={valorBarra}
          aria-valuetext={textoGanando(ganando)}
        >
          <div className="barra-mitad barra-mitad-pro" />
          <div className="barra-mitad barra-mitad-con" />
          <div className="barra-centro" />
          <motion.div
            className="barra-marcador"
            initial={false}
            animate={{ left: `${posBarra}%` }}
            transition={quieto ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 18 }}
          />
        </div>
        <span className="barra-extremo barra-extremo-con" aria-hidden="true">😈</span>
      </div>
      <p className="barra-texto">{textoGanando(ganando)}</p>

      <div
        className="caja-dialogo"
        onClick={alHacerClicEnCaja}
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
        ) : enFinal ? (
          <div className="caja-eleccion">
            {!eleccion ? (
              <>
                <p className="caja-pregunta">* ¿A quién le haces caso?</p>
                <div className="eleccion-botones">
                  {(["pro", "con"] as const).map((quien) => (
                    <button
                      key={quien}
                      className={`eleccion-boton eleccion-${quien}${ganando === quien ? " caja-boton-sugerido" : ""}`}
                      onClick={() => elegir(quien)}
                      aria-label={
                        ganando === quien
                          ? `Hacer caso al ${NOMBRES[quien]} (iba ganando en la barra)`
                          : `Hacer caso al ${NOMBRES[quien]}`
                      }
                    >
                      <span aria-hidden>
                        <PixelSprite personaje={quien} fotograma="victoria" escala={1.5} />
                      </span>
                      <span>
                        <span className="eleccion-titulo">{ELECCION[quien].titulo}</span>
                        <span className="eleccion-detalle">{ELECCION[quien].detalle}</span>
                        {ganando === quien && <span className="eleccion-sugerido">Iba ganando en la barra</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={`caja-nombre arena-nombre-${eleccion}`}>{NOMBRES[eleccion]}</div>
                <p className="caja-texto">{desenlace ?? "..."}</p>
              </>
            )}
          </div>
        ) : (
          <>
            {nombreCaja && <div className={`caja-nombre arena-nombre-${speaker}`}>{nombreCaja}</div>}
            <p className="caja-texto">
              {shown}
              {!done && <span className="caja-cursor" aria-hidden="true" />}
            </p>
            {mostrarVoto && (
              <button
                className="voto-boton"
                onClick={(e) => {
                  e.stopPropagation();
                  votar(ultimoIdx);
                }}
                disabled={!puedeVotar(ultimoIdx)}
                aria-label={etiquetaVoto(ultimoIdx)}
              >
                <span aria-hidden="true">👍</span>
              </button>
            )}
            {done && !thinking && !waitingIntervention && !error && status === "running" && esperandoSiguiente && (
              <button
                className="caja-flecha"
                onClick={(e) => {
                  e.stopPropagation();
                  siguiente();
                }}
                aria-label="Siguiente"
              >
                Siguiente <span className="caja-flecha-triangulo" aria-hidden="true">▼</span>
              </button>
            )}
          </>
        )}

        {aviso && !error && (
          <p className="caja-aviso" role="status">{aviso}</p>
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
              maxLength={MAX_INTERVENCION}
              className="caja-campo"
            />
            <p className="text-sm opacity-60 text-right">
              {interventionText.length}/{MAX_INTERVENCION}
            </p>
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

      {enFinal && eleccion && desenlace && (
        <>
          <TarjetaDesenlace
            tema={config.topic}
            desenlace={desenlace}
            ganador={eleccion}
            onJugarOtra={handleReset}
            volcado={volcadoTarjeta}
          />
          <div className="marcador-contenedor">
            <div className="marcador-box">
              <div className="marcador-puntos">
                😇 {marcador.angel} – {marcador.diablo} 😈
              </div>
              <div className="marcador-titulo">{tituloSegunRecord(marcador)}</div>
              <button
                className="marcador-boton"
                onClick={() => {
                  if (typeof window !== "undefined" && window.confirm("¿Borrar todo el marcador?")) {
                    borrarMarcador();
                  }
                }}
                aria-label="Borrar marcador"
              >
                Borrar marcador
              </button>
            </div>
          </div>
        </>
      )}

      <div className="arena-barra">
        {(status === "running" || status === "paused") && !waitingIntervention && !error && (
          <button className="arena-enlace" onClick={status === "running" ? debate.pause : debate.play}>
            {status === "running" ? "Pausar" : "Continuar"}
          </button>
        )}
        <button
          className="arena-enlace"
          onClick={() => setSoundEnabled(!soundEnabled)}
          aria-label={soundEnabled ? "Silenciar sonido" : "Activar sonido"}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
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
                <strong className={`arena-nombre-${m.role}`}>{NOMBRES[m.role]}:</strong> {m.content}{" "}
                {(m.role === "pro" || m.role === "con") && (
                  <button
                    className="voto-boton voto-chico"
                    onClick={() => votar(i)}
                    disabled={!puedeVotar(i)}
                    aria-label={etiquetaVoto(i)}
                  >
                    <span aria-hidden="true">👍</span>
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}
