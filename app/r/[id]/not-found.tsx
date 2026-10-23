import Link from "next/link";
import PixelSprite from "@/components/PixelSprite";

// /r/<id> con un id que no existe o mal copiado.
export default function RetoNoEncontrado() {
  return (
    <main className="min-h-screen py-8 px-4 flex items-center justify-center">
      <section className="config-aviso reto-no-encontrado">
        <div className="reto-no-encontrado-sprites" aria-hidden>
          <PixelSprite personaje="pro" fotograma="reposo" escala={2} />
          <PixelSprite personaje="con" fotograma="reposo" escala={2} />
        </div>
        <h1 className="reto-no-encontrado-titulo">No encontramos este reto</h1>
        <p>Puede que el enlace esté incompleto o mal copiado. Pídele a quien te lo mandó que lo comparta de nuevo.</p>
        <Link href="/" className="caja-boton reto-jugar">
          Juega tu propio dilema
        </Link>
      </section>
    </main>
  );
}
