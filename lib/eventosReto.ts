// Eventos del reto (cotejo-o7aqeg): enganchados a los contadores de lib/metricas.ts.
//  - "reto_abierto": app/r/[id]/contenido.tsx, cuando alguien abre /r/<id> y el reto existe.
//  - "reto_votado": app/api/retos/[id]/voto/route.ts, solo cuando el voto entra por primera vez.
// Nunca lanza. No se guarda el id del reto, el del votante ni a quién votó: solo «hoy hubo uno más».

import { contar } from "./metricas.ts";

export type EventoReto = "reto_abierto" | "reto_votado";

export interface DatosEventoReto {
  /** Se recibe por comodidad de quien llama, pero NO se guarda. */
  retoId: string;
  /** Solo en "reto_votado"; tampoco se guarda. */
  voto?: "pro" | "con";
}

/** Bots que leen la vista previa del enlace (WhatsApp, Facebook, X, Telegram, Discord...): no son personas. */
const RASTREADORES = /whatsapp|facebookexternalhit|facebot|meta-externalagent|twitterbot|telegrambot|discordbot|slackbot|linkedinbot|skypeuripreview|bot\b|crawler|spider|preview/i;

export function esRastreador(userAgent: string | null | undefined): boolean {
  return !!userAgent && RASTREADORES.test(userAgent);
}

export async function contarEventoReto(evento: EventoReto, datos: DatosEventoReto): Promise<void> {
  void datos;
  await contar(evento).catch(() => {});
}
