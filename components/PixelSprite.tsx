import { nombreVisible } from "@/lib/personalidades";
import {
  NOMBRE_PERSONAJE,
  TAMANO_SPRITE,
  matrizDe,
  rectsDeMatriz,
  type FotogramaSprite,
  type PersonajeSprite,
} from "@/lib/sprites";

interface PixelSpriteProps {
  personaje: PersonajeSprite;
  fotograma?: FotogramaSprite;
  /** Píxeles de pantalla por píxel del sprite (4 → 128×128). */
  escala?: number;
  /** Id de personalidad del catálogo: pinta su variante (accesorio y paleta). Sin él, el sprite clásico. */
  personalidad?: string;
  className?: string;
}

/** Pinta un sprite de 32×32 como SVG nítido, sin imágenes. */
export default function PixelSprite({
  personaje,
  fotograma = "reposo",
  escala = 4,
  personalidad,
  className,
}: PixelSpriteProps) {
  const rects = rectsDeMatriz(matrizDe(personaje, fotograma, personalidad));
  const lado = TAMANO_SPRITE * escala;
  return (
    <svg
      width={lado}
      height={lado}
      viewBox={`0 0 ${TAMANO_SPRITE} ${TAMANO_SPRITE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`${personaje === "usuario" ? NOMBRE_PERSONAJE[personaje] : nombreVisible(personaje, personalidad)} (${fotograma})`}
      className={className}
    >
      {rects.map((r) => (
        <rect
          key={`${r.x}-${r.y}`}
          x={r.x}
          y={r.y}
          width={r.ancho}
          height={1}
          fill={r.color}
        />
      ))}
    </svg>
  );
}
