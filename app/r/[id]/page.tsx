import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { cargarReto } from "@/lib/cargarReto";
import { textosMetadataReto } from "@/lib/vistaReto";
import ContenidoReto from "./contenido";

// PÁGINA DEL RETO /r/<id> (v0.4.0, cotejo-6tlml4). Quien recibe el enlace ve el debate guardado con la
// misma arena del juego (sin cuenta ni llamadas a modelos), vota y después ve qué votó la gente y qué
// eligió quien la retó. El enlace lo da POST /api/retos (`ruta: "/r/<id>"`).
//
// Cache Components: el id es dato de petición (no hay generateStaticParams), así que solo se lee dentro
// de <Suspense> (ContenidoReto). El marco de la página es estático y se prerenderiza.

/** Origen público para las URLs absolutas de Open Graph; sin él, Next usa el de Vercel. */
function baseMetadata(): URL | undefined {
  const v = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!v) return undefined;
  try {
    return new URL(v);
  } catch {
    return undefined;
  }
}

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  const carga = await cargarReto(id);
  if (carga.estado !== "ok") {
    const title = carga.estado === "no_existe" ? "Reto no encontrado · Diablongo" : "Reto de Diablongo";
    return { metadataBase: baseMetadata(), title, robots: { index: false, follow: false } };
  }
  const { titulo, descripcion } = textosMetadataReto(carga.reto);
  return {
    metadataBase: baseMetadata(),
    title: titulo,
    description: descripcion,
    // Los retos son de cada persona: se comparten por enlace, no se indexan.
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Diablongo",
      locale: "es_CO",
      url: `/r/${carga.reto.id}`,
      title: titulo,
      description: descripcion,
    },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion },
  };
}

export default function PaginaReto({ params }: PageProps<"/r/[id]">) {
  return (
    <main className="min-h-screen py-6 px-4">
      <header className="reto-cabecera">
        <Link href="/" className="reto-logo" aria-label="Diablongo: ir al inicio">
          <Logo />
        </Link>
        <p className="reto-intro">Te retaron: mira cómo lo debatieron el Ángel y el Diablo, y vota a quién le harías caso.</p>
        <Link href="/" className="caja-boton reto-jugar">
          Juega tu propio dilema
        </Link>
      </header>
      <Suspense fallback={<p className="reto-cargando" role="status">Cargando el reto…</p>}>
        <ContenidoReto params={params} />
      </Suspense>
    </main>
  );
}
