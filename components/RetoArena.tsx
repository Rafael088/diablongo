"use client";

import { useState } from "react";
import DebateArena from "./DebateArena";
import VotoReto from "./VotoReto";
import type { GenerateTurn } from "@/hooks/useDebate";
import type { DebateConfig } from "@/types";
import { mensajesDeTurnos, nombresReto, type VistaReto } from "@/lib/vistaReto";

/** Pausa entre frases de la repetición: lo que tardaría «pensando» un personaje (sin llamar a nadie). */
const PAUSA_MS = 600;

/**
 * Repite el debate guardado de un reto con la misma arena del juego, alimentada con sus frases:
 * nunca llama a /api/debate ni pide cuenta. Al terminar, en vez de elegir, se vota (VotoReto).
 */
export default function RetoArena({ reto }: { reto: VistaReto }) {
  // Cambiar la clave vuelve a montar la arena: «Reiniciar» repite el debate, «Saltar» va al final.
  const [vuelta, setVuelta] = useState(0);
  const [saltar, setSaltar] = useState(false);
  const nombres = nombresReto(reto.personalidades);

  const config: DebateConfig = {
    topic: reto.tema,
    pro: { role: "pro", provider: "reto", model: "", apiKey: "", name: nombres.pro, personalidad: reto.personalidades.pro },
    con: { role: "con", provider: "reto", model: "", apiKey: "", name: nombres.con, personalidad: reto.personalidades.con },
  };

  const generate: GenerateTurn = async ({ history }) => {
    await new Promise((r) => setTimeout(r, PAUSA_MS));
    const dichos = history.filter((m) => m.role !== "user").length;
    return reto.turnos[dichos] ?? "...";
  };

  return (
    <>
      <DebateArena
        key={`${vuelta}-${saltar}`}
        config={config}
        generate={generate}
        persist={false}
        onReset={() => {
          setSaltar(false);
          setVuelta((n) => n + 1);
        }}
        pantallaFinal={({ ganando }) => (
          <VotoReto retoId={reto.id} personalidades={reto.personalidades} nombres={nombres} ganando={ganando} />
        )}
        {...(saltar
          ? { initialMessages: mensajesDeTurnos(reto.turnos), initialStatus: "finished" as const, instant: true }
          : {})}
      />
      {!saltar && (
        <p className="reto-saltar">
          <button type="button" className="arena-enlace" onClick={() => setSaltar(true)}>
            Saltar al final y votar
          </button>
        </p>
      )}
    </>
  );
}
