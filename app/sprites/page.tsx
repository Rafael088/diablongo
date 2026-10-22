import type { Metadata } from "next";
import PixelSprite from "@/components/PixelSprite";
import {
  NOMBRE_PERSONAJE,
  fotogramasDe,
  type PersonajeSprite,
} from "@/lib/sprites";

export const metadata: Metadata = {
  title: "Sprites · Diablongo",
};

const PERSONAJES: PersonajeSprite[] = ["pro", "con", "usuario"];

/** Muestra de todos los personajes con todos sus fotogramas a escala 4×. */
export default function SpritesPage() {
  return (
    <main className="min-h-screen bg-[#14121c] px-6 py-10 text-zinc-200">
      <h1 className="mb-8 text-2xl font-semibold">Sprites</h1>
      <div className="flex flex-col gap-10">
        {PERSONAJES.map((personaje) => (
          <section key={personaje}>
            <h2 className="mb-3 text-lg">{NOMBRE_PERSONAJE[personaje]}</h2>
            <div className="flex flex-wrap gap-6">
              {fotogramasDe(personaje).map((fotograma) => (
                <figure key={fotograma} className="flex flex-col items-center gap-2">
                  <PixelSprite personaje={personaje} fotograma={fotograma} escala={4} />
                  <figcaption className="text-sm text-zinc-400">{fotograma}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
