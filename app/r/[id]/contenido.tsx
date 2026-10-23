import { notFound } from "next/navigation";
import RetoArena from "@/components/RetoArena";
import { cargarReto } from "@/lib/cargarReto";
import { contarEventoReto } from "@/lib/eventosReto";
import { vistaReto } from "@/lib/vistaReto";

/**
 * Parte de /r/<id> que depende del id: lee el reto en el servidor y le pasa al navegador SOLO lo que
 * puede ver antes de votar (vistaReto: sin la elección de quien retó ni el desenlace).
 */
export default async function ContenidoReto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carga = await cargarReto(id);
  if (carga.estado === "no_existe") notFound();
  if (carga.estado === "no_disponible") {
    return (
      <p className="config-aviso reto-aviso" role="alert">
        Los retos no están disponibles ahora. Vuelve a abrir el enlace en un rato.
      </p>
    );
  }
  // Enganche de contadores (cotejo-o7aqeg): ver lib/eventosReto.ts.
  await contarEventoReto("reto_abierto", { retoId: carga.reto.id }).catch(() => {});
  return <RetoArena reto={vistaReto(carga.reto)} />;
}
