// Logo de Diablongo en código: la palabra en Press Start 2P con el degradado del tablero
// de marca (crema → oro → rojo, en escalones), contorno rojo duro y dos cuernos de píxel.

/** Cuerno de 6×7 píxeles que se curva hacia fuera; "t" punta, "c" cuerno, "C" sombra. El derecho es el espejo. */
const CUERNO = [
  "t.....",
  "tc....",
  ".cc...",
  ".ccc..",
  "..cccC",
  "..ccCC",
  "...cCC",
];
const COLOR_CUERNO: Record<string, string> = { t: "#FFC857", c: "#FF4D6D", C: "#D7263D" };

function Cuerno({ espejo }: { espejo?: boolean }) {
  return (
    <svg
      viewBox="0 0 6 7"
      shapeRendering="crispEdges"
      className="logo-cuerno"
      style={espejo ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden
    >
      {CUERNO.flatMap((fila, y) =>
        [...fila].map((c, x) =>
          COLOR_CUERNO[c] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLOR_CUERNO[c]} /> : null,
        ),
      )}
    </svg>
  );
}

interface LogoProps {
  /** Lema debajo de la palabra. */
  lema?: boolean;
  className?: string;
}

export default function Logo({ lema = false, className }: LogoProps) {
  return (
    <div className={`logo${className ? ` ${className}` : ""}`}>
      <h1 className="logo-palabra">
        <Cuerno />
        <span className="logo-texto">Diablongo</span>
        <Cuerno espejo />
      </h1>
      {lema && <p className="logo-lema">Tu cabeza es un campo de batalla</p>}
    </div>
  );
}
