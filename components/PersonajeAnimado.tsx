"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { FotogramaSprite, PersonajeSprite } from "@/lib/sprites";
import PixelSprite from "./PixelSprite";

export type Bando = "pro" | "con";

interface PersonajeAnimadoProps {
  personaje: PersonajeSprite;
  fotograma: FotogramaSprite;
  nombre: string;
  claseNombre: string;
  activo: boolean;
  /** Desfase de la flotación, en segundos, para que no suban a la vez. */
  desfase?: number;
  /** El personaje acaba de ser refutado: sacudida y destello. */
  golpeado?: boolean;
  /** Deja el golpe quieto en plena sacudida con destello (capturas y demo). */
  golpeQuieto?: boolean;
  /** Este personaje ganó el debate (solo tiene efecto en Ángel y Diablo). */
  victorioso?: boolean;
}

/** Llamas pixel en SVG: columnas de 3 cuadros que suben y se apagan. */
const LLAMAS = [
  { x: 2, alto: 3, retardo: 0 },
  { x: 7, alto: 4, retardo: 0.35 },
  { x: 12, alto: 3, retardo: 0.15 },
  { x: 17, alto: 4, retardo: 0.5 },
  { x: 22, alto: 3, retardo: 0.25 },
  { x: 27, alto: 4, retardo: 0.1 },
];
const COLORES_FUEGO = ["#fde047", "#fb923c", "#dc2626"];

function Fuego({ quieto }: { quieto: boolean }) {
  return (
    <svg
      viewBox="0 0 32 12"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="personaje-fuego"
    >
      {LLAMAS.map((l) =>
        COLORES_FUEGO.slice(0, l.alto - 1).map((color, i) => (
          <motion.rect
            key={`${l.x}-${i}`}
            x={l.x + (i === 1 ? 0.5 : 0)}
            y={9 - i * 2.5}
            width={3 - i * 0.5}
            height={2.5}
            fill={color}
            initial={false}
            animate={quieto ? undefined : { y: [9 - i * 2.5, 5 - i * 2.5, 9 - i * 2.5], opacity: [1, 0.35, 1] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: l.retardo + i * 0.08, ease: "easeInOut" }}
          />
        )),
      )}
    </svg>
  );
}

export default function PersonajeAnimado({
  personaje,
  fotograma,
  nombre,
  claseNombre,
  activo,
  desfase = 0,
  golpeado = false,
  golpeQuieto = false,
  victorioso = false,
}: PersonajeAnimadoProps) {
  const quieto = useReducedMotion() ?? false;
  const esAngel = personaje === "pro";
  const esDiablo = personaje === "con";

  // Capa 1: flotar en reposo (o rebotar de risa si es el diablo ganador).
  const capaFlotar =
    quieto || golpeado
      ? { y: 0 }
      : victorioso && esDiablo
        ? { y: [0, -12, 0, -7, 0] }
        : { y: [0, -5, 0] };
  const transFlotar =
    victorioso && esDiablo
      ? { duration: 0.7, repeat: Infinity, repeatDelay: 0.5, ease: "easeOut" as const }
      : { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const, delay: desfase };

  // Capa 2: sacudida horizontal y destello blanco al ser refutado.
  const capaGolpe =
    golpeado && golpeQuieto
      ? { x: -7, filter: "brightness(2.2)" }
      : golpeado && !quieto
      ? { x: [0, -9, 9, -6, 6, -3, 0], filter: ["brightness(1)", "brightness(5)", "brightness(1)"] }
      : { x: 0, filter: "brightness(1)" };

  return (
    <div className={`arena-personaje ${activo ? "" : "arena-apagado"}`}>
      <div className="personaje-lienzo">
        {victorioso && esAngel && (
          <motion.div
            className="personaje-halo"
            aria-hidden="true"
            animate={quieto ? undefined : { opacity: [0.55, 1, 0.55], scale: [0.95, 1.08, 0.95] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {victorioso && esDiablo && <Fuego quieto={quieto} />}
        <motion.div animate={capaFlotar} transition={transFlotar}>
          <motion.div animate={capaGolpe} transition={{ duration: 0.55, ease: "easeOut" }}>
            <PixelSprite
              personaje={personaje}
              fotograma={fotograma}
              escala={4}
              className="w-full h-auto"
            />
          </motion.div>
        </motion.div>
      </div>
      <span className={`arena-nombre ${claseNombre}`}>{nombre}</span>
    </div>
  );
}
