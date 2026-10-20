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

/** Desenlaces fijos de ejemplo para ?final=pro y ?final=con (no llaman al servidor). */
const DESENLACES = {
  pro: "Elegiste al Angelito: casa, pijama y cero tráfico. Tu espalda te da las gracias.",
  con: "Elegiste al Diablito: rines 17 instalados. Tu bolsillo llora.",
} as const;

const generate: GenerateTurn = async ({ history, phase, speaker }) => {
  if (phase === "desenlace") return DESENLACES[speaker];
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

/** ?votos=pro,pro,con precarga 👍: cada uno cae en la siguiente frase de ese bando. */
function indicesDeVotos(param: string | null, mensajes: DebateMessage[]): number[] {
  if (!param) return [];
  const usados = new Set<number>();
  for (const b of param.split(",")) {
    const i = mensajes.findIndex((m, k) => m.role === b && !usados.has(k));
    if (i >= 0) usados.add(i);
  }
  return [...usados];
}

/** ?marcador=3-5 deja ese marcador guardado antes de pintar (solo en la demo). */
function guardarMarcadorDeDemo(param: string | null) {
  if (typeof window === "undefined" || !param) return;
  const m = /^(\d+)-(\d+)$/.exec(param);
  if (!m) return;
  try {
    localStorage.setItem(
      "marcador-angel-diablo",
      JSON.stringify({ angel: Number(m[1]), diablo: Number(m[2]) }),
    );
  } catch {
    // sin localStorage: la demo sigue sin marcador
  }
}

function Demo() {
  const router = useRouter();
  const params = useSearchParams();
  guardarMarcadorDeDemo(params.get("marcador"));
  const turno = Number(params.get("turno"));
  const g = params.get("ganador");
  const ganador = g === "pro" || g === "con" ? g : undefined;
  const final = params.get("final");
  const eleccionFinal = final === "pro" || final === "con" ? final : undefined;
  const golpe = params.get("golpe");
  const golpeFijo = golpe === "pro" || golpe === "con" ? golpe : undefined;
  // ?ganador= y ?golpe= imponen su propio turno congelado (el final o el 4).
  const turnoFinal = ganador || final ? 8 : golpeFijo ? 4 : turno;
  const congelada = Number.isInteger(turnoFinal) && turnoFinal >= 1 && turnoFinal <= 8;
  // ?final=1 deja la pantalla de elección; sin ?votos= el Diablo va ganando.
  const votosParam = params.get("votos") ?? (final ? "con,con,pro" : null);
  const votosIniciales = congelada
    ? indicesDeVotos(votosParam, mensajesHasta(turnoFinal))
    : undefined;
  return (
    <DebateArena
      key={congelada ? `${turnoFinal}${ganador ?? ""}${golpeFijo ?? ""}${votosParam ?? ""}${final ?? ""}` : "viva"}
      config={config}
      onReset={() => router.push("/arena-demo")}
      generate={generate}
      persist={false}
      ganador={ganador}
      golpeFijo={golpeFijo}
      votosIniciales={votosIniciales}
      eleccionInicial={eleccionFinal}
      desenlaceInicial={eleccionFinal ? DESENLACES[eleccionFinal] : undefined}
      volcadoTarjeta={params.get("volcado") === "1"}
      {...(congelada
        ? {
            initialMessages: mensajesHasta(turnoFinal),
            initialStatus: final ? ("finished" as const) : ("paused" as const),
            instant: true,
          }
        : {})}
    />
  );
}

export default function ArenaDemoPage() {
  return (
    <main className="min-h-screen py-6 px-3">
      <Suspense>
        <Demo />
      </Suspense>
    </main>
  );
}
