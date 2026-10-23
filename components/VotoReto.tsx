"use client";

import { useState } from "react";
import Link from "next/link";
import PixelSprite from "./PixelSprite";
import TurnstileWidget from "./TurnstileWidget";
import type { DebateRole } from "@/types";
import type { Ganando } from "@/lib/tentacion";
import { ACCION_TURNSTILE_VOTO } from "@/lib/turnstile";
import { MENSAJE_VOTO_NO_DISPONIBLE, porcentajes, type ResultadoVotoReto, type VistaReto } from "@/lib/vistaReto";

const SITEKEY_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
// Igual que en el inicio: sin sitekey solo se puede votar en desarrollo (el servidor también omite ahí).
const OMITIR_TURNSTILE = !SITEKEY_TURNSTILE && process.env.NODE_ENV === "development";

const ROLES = ["pro", "con"] as const;
const EMOJI: Record<DebateRole, string> = { pro: "😇", con: "😈" };

interface VotoRetoProps {
  retoId: string;
  personalidades: VistaReto["personalidades"];
  nombres: Record<DebateRole, string>;
  /** Quién iba ganando en la barra de 👍 de quien mira (solo se resalta, no decide). */
  ganando: Ganando;
}

/**
 * Final de la repetición de un reto: la persona vota (Turnstile, un voto por navegador) y solo
 * entonces ve qué votó la gente y a quién le hizo caso quien la retó.
 */
export default function VotoReto({ retoId, personalidades, nombres, ganando }: VotoRetoProps) {
  const [token, setToken] = useState<string | null>(null);
  // Cada token sirve una vez: tras un intento fallido se vuelve a montar el widget.
  const [widget, setWidget] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoVotoReto | null>(null);

  const listo = OMITIR_TURNSTILE || token !== null;

  const votar = async (voto: DebateRole) => {
    if (enviando || !listo) return;
    setEnviando(true);
    setError(null);
    const verificacion = token;
    setToken(null);
    try {
      const res = await fetch(`/api/retos/${encodeURIComponent(retoId)}/voto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voto, turnstile: verificacion ?? undefined }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof datos.error === "string" ? datos.error : MENSAJE_VOTO_NO_DISPONIBLE);
      setResultado(datos as ResultadoVotoReto);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : MENSAJE_VOTO_NO_DISPONIBLE);
      setWidget((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  };

  if (resultado) return <Resultado resultado={resultado} nombres={nombres} personalidades={personalidades} />;

  return (
    <>
      <p className="caja-pregunta">* ¿A quién le harías caso tú?</p>
      {SITEKEY_TURNSTILE ? (
        <TurnstileWidget
          key={widget}
          sitekey={SITEKEY_TURNSTILE}
          accion={ACCION_TURNSTILE_VOTO}
          ayuda="Comprobación de seguridad de Cloudflare: confirma que eres una persona antes de votar."
          onToken={setToken}
        />
      ) : (
        !OMITIR_TURNSTILE && (
          <p className="text-sm" role="alert">
            La votación no está disponible: falta configurar la comprobación de seguridad.
          </p>
        )
      )}
      <div className="eleccion-botones">
        {ROLES.map((quien) => (
          <button
            key={quien}
            type="button"
            className={`eleccion-boton eleccion-${quien}${ganando === quien ? " caja-boton-sugerido" : ""}`}
            onClick={() => votar(quien)}
            disabled={!listo || enviando}
            aria-label={`Votar por ${nombres[quien]}`}
          >
            <span aria-hidden>
              <PixelSprite personaje={quien} fotograma="victoria" escala={1.5} personalidad={personalidades[quien]} />
            </span>
            <span>
              <span className="eleccion-titulo">Le hago caso a {nombres[quien]}</span>
              {ganando === quien && <span className="eleccion-sugerido">Iba ganando en tu barra</span>}
            </span>
          </button>
        ))}
      </div>
      {enviando && <p role="status">Guardando tu voto…</p>}
      {!listo && !enviando && SITEKEY_TURNSTILE && (
        <p className="text-sm opacity-70">Cuando pase la comprobación de seguridad, podrás votar.</p>
      )}
      {error && (
        <p className="caja-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function Resultado({
  resultado,
  nombres,
  personalidades,
}: {
  resultado: ResultadoVotoReto;
  nombres: Record<DebateRole, string>;
  personalidades: VistaReto["personalidades"];
}) {
  const { votos, voto, eleccion, desenlace, registrado } = resultado;
  const pct = porcentajes(votos);
  const total = votos.pro + votos.con;
  const coinciden = voto === eleccion;
  return (
    <div className="reto-resultado" aria-live="polite">
      <p className="caja-pregunta">
        {registrado ? `* Votaste por ${nombres[voto]}.` : `* Ya habías votado desde este navegador: ${nombres[voto]}.`}
      </p>

      <div className="reto-retador">
        <PixelSprite personaje={eleccion} fotograma="victoria" escala={1.5} personalidad={personalidades[eleccion]} />
        <div>
          <p>
            Quien te retó le hizo caso a <strong className={`arena-nombre-${eleccion}`}>{nombres[eleccion]}</strong>.{" "}
            {coinciden ? "¡Pensaron igual!" : "No pensaron igual."}
          </p>
          {desenlace && <p className="reto-desenlace">«{desenlace}»</p>}
        </div>
      </div>

      <div className="reto-votos" role="group" aria-label="Lo que votó la gente">
        <p className="reto-votos-titulo">
          Lo que votó la gente ({total} {total === 1 ? "voto" : "votos"})
        </p>
        {ROLES.map((quien) => (
          <div key={quien} className="reto-voto-fila">
            <span className="reto-voto-nombre">
              <span aria-hidden>{EMOJI[quien]}</span> {nombres[quien]}
            </span>
            <span className="reto-voto-pista" aria-hidden>
              <span className={`reto-voto-relleno reto-voto-${quien}`} style={{ width: `${pct[quien]}%` }} />
            </span>
            <span className="reto-voto-cifra">
              {pct[quien]}% · {votos[quien]}
            </span>
          </div>
        ))}
      </div>

      <Link href="/" className="caja-boton reto-jugar">
        Juega tu propio dilema
      </Link>
    </div>
  );
}
