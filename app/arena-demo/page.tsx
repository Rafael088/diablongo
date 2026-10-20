"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DebateArena from "@/components/DebateArena";
import { TURN_PLAN } from "@/lib/debateEngine";
import type { DebateConfig, DebateMessage } from "@/types";
import type { GenerateTurn } from "@/hooks/useDebate";

// Debate de ejemplo con frases fijas: no llama al servidor ni pide claves.
const FRASES: string[] = [
  "Trabajar desde casa da libertad. Ahorras horas de viaje y las dedicas a lo que importa.",
  "Libertad, dices. Yo veo una casa donde nunca apagas el ordenador y el jefe vive en tu sala.",
  "Pero la confianza se construye con resultados, no con asientos ocupados en una oficina.",
  "Los resultados se hablan en un pasillo. En la pantalla solo se acumulan malentendidos.",
  "Y aun así, quien tiene hijos o vive lejos respira por fin. Eso también es productividad.",
  "Respira, sí, pero solo y sin nadie con quien compartir un café. La soledad también cobra.",
  "Entonces que cada persona elija. Lo mejor es la flexibilidad, no la obligación de ninguna de las dos.",
  "Elegir es cómodo hasta que todos eligen quedarse en casa y nadie conoce a nadie. Yo tengo la última palabra.",
];

const config: DebateConfig = {
  topic: "¿Es mejor trabajar desde casa?",
  pro: { role: "pro", provider: "demo", model: "demo", apiKey: "", name: "Ángel" },
  con: { role: "con", provider: "demo", model: "demo", apiKey: "", name: "Diablo" },
};

const generate: GenerateTurn = async ({ history }) => {
  await new Promise((r) => setTimeout(r, 700));
  const jugados = history.filter((m) => m.role !== "user").length;
  return FRASES[jugados] ?? "...";
};

/** ?turno=N deja la demo quieta tras N turnos con el texto a la vista. */
function mensajesHasta(n: number): DebateMessage[] {
  return TURN_PLAN.slice(0, n).map((t, i) => ({
    role: t.nextSpeaker,
    content: FRASES[i],
    round: t.round,
    phase: t.phase,
  }));
}

function Demo() {
  const router = useRouter();
  const turno = Number(useSearchParams().get("turno"));
  const congelada = Number.isInteger(turno) && turno >= 1 && turno <= 8;
  return (
    <DebateArena
      key={congelada ? turno : "viva"}
      config={config}
      onReset={() => router.push("/arena-demo")}
      generate={generate}
      persist={false}
      {...(congelada
        ? { initialMessages: mensajesHasta(turno), initialStatus: "paused" as const, instant: true }
        : {})}
    />
  );
}

export default function ArenaDemoPage() {
  return (
    <main className="min-h-screen bg-zinc-950 py-6 px-3">
      <Suspense>
        <Demo />
      </Suspense>
    </main>
  );
}
