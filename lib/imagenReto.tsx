import type { ReactElement } from "react";
import type { DebateRole } from "../types/index.ts";
import { TOKENS } from "./paleta.ts";
import { matrizDe, svgDeMatriz } from "./sprites/index.ts";
import { nombreVisible } from "./personalidades.ts";
import { MARCA_TARJETA } from "./desenlace.ts";
import { temaParaTitulo } from "./vistaReto.ts";
import type { RetoPublico } from "./retos.ts";

// Imagen de Open Graph del reto (app/r/[id]/opengraph-image.tsx), en JSX de next/og (Satori: solo
// flexbox y estilos en línea). Sin la elección de quien retó: la vista previa no destripa el final.

export const ANCHO_OG = 1200;
export const ALTO_OG = 630;
const C = TOKENS;
const LADO_SPRITE = 256;
const ACENTO: Record<DebateRole, string> = { pro: C["--color-angel"], con: C["--color-diablo"] };

/** Sprite como imagen SVG en data URI (nítido a cualquier escala: son rectángulos). */
export function spriteDataUri(rol: DebateRole, personalidad?: string): string {
  const svg = svgDeMatriz(matrizDe(rol, "reposo", personalidad), 1);
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** Tamaño de letra del dilema según lo largo que sea (cabe en 3-4 líneas en la columna central). */
export function tamanoTema(tema: string): number {
  const n = tema.length;
  return n <= 40 ? 58 : n <= 80 ? 46 : 38;
}

function Personaje({ rol, personalidad }: { rol: DebateRole; personalidad?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 300, gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og pinta <img>, no next/image */}
      <img src={spriteDataUri(rol, personalidad)} width={LADO_SPRITE} height={LADO_SPRITE} alt="" />
      <div style={{ fontSize: 34, fontWeight: 700, color: ACENTO[rol], textAlign: "center" }}>
        {nombreVisible(rol, personalidad)}
      </div>
    </div>
  );
}

/** Contenido de la imagen; `reto` null = imagen genérica (reto inexistente o base caída). */
export function imagenReto(reto: Pick<RetoPublico, "tema" | "personalidades"> | null): ReactElement {
  const tema = reto ? temaParaTitulo(reto.tema, 110) : "¿A quién le harías caso?";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C["--color-fondo"],
        color: C["--color-texto"],
        border: `12px solid ${C["--color-borde"]}`,
        padding: "28px 24px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", fontSize: 30, letterSpacing: 6, color: C["--color-acento"], fontWeight: 700 }}>
        {MARCA_TARJETA.toUpperCase()} · TE RETARON
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Personaje rol="pro" personalidad={reto?.personalidades.pro} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 540, gap: 22 }}>
          <div
            style={{
              display: "flex",
              textAlign: "center",
              justifyContent: "center",
              fontSize: tamanoTema(tema),
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            {tema}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: C["--color-texto-suave"], textAlign: "center" }}>
            ¿A quién le harías caso tú?
          </div>
        </div>
        <Personaje rol="con" personalidad={reto?.personalidades.con} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: 28, color: C["--color-texto"] }}>
        Mira el debate y vota: ¿Ángel o Diablo?
      </div>
    </div>
  );
}
