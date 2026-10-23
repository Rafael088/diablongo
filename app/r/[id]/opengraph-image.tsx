import { ImageResponse } from "next/og";
import { cargarReto } from "@/lib/cargarReto";
import { imagenReto, ALTO_OG, ANCHO_OG } from "@/lib/imagenReto";

// Vista previa al compartir /r/<id> (WhatsApp, Telegram, X…): el dilema y los dos personajes con su
// personalidad. Lo importante va en el centro: WhatsApp recorta al centro en la vista pequeña.
export const alt = "Reto de Diablongo: un Ángel y un Diablo debaten un dilema. ¿A quién le harías caso?";
export const size = { width: ANCHO_OG, height: ALTO_OG };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carga = await cargarReto(id);
  return new ImageResponse(imagenReto(carga.estado === "ok" ? carga.reto : null), size);
}
