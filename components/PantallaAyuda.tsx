"use client";

// Lo que se ve en vez del debate cuando el tema es crítico (lib/temaCritico.ts): sin personajes, sin
// juego y sin bromas. Líneas de Colombia, que es el público principal, y un buscador para otros países.

interface PantallaAyudaProps {
  onVolver: () => void;
}

const LINEAS = [
  { numero: "192", detalle: "opción 4 · salud mental, gratis, todo el día (Colombia)", tel: "192" },
  { numero: "106", detalle: "«El poder de ser escuchado» · Bogotá", tel: "106" },
  { numero: "123", detalle: "si estás en peligro ahora mismo o ya tomaste algo", tel: "123" },
];

export default function PantallaAyuda({ onVolver }: PantallaAyudaProps) {
  return (
    <section className="w-full max-w-2xl mx-auto p-6" aria-labelledby="ayuda-titulo">
      <div className="config-caja space-y-5">
        <h2 id="ayuda-titulo" className="config-titulo">
          Esto no es para un juego
        </h2>
        <p>
          Lo que estás pensando importa, y mereces hablarlo con alguien de verdad, no con un ángel y un diablo
          de mentiras. No tienes que pasarlo solo ni sola.
        </p>
        <p>Puedes llamar ahora mismo, sin costo:</p>
        <ul className="space-y-3">
          {LINEAS.map((l) => (
            <li key={l.numero} className="config-aviso">
              <a href={`tel:${l.tel}`} className="underline">
                <strong>{l.numero}</strong>
              </a>{" "}
              — {l.detalle}
            </li>
          ))}
        </ul>
        <p>
          Si no estás en Colombia, en{" "}
          <a href="https://findahelpline.com/es" target="_blank" rel="noopener noreferrer" className="underline">
            findahelpline.com
          </a>{" "}
          encuentras la línea de tu país. También puedes escribirle ya a alguien de confianza.
        </p>
        <button type="button" className="config-iniciar" onClick={onVolver}>
          Volver
        </button>
      </div>
    </section>
  );
}
