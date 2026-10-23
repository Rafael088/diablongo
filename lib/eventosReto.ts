// PUNTO DE ENGANCHE para los contadores (tarea cotejo-o7aqeg). Hoy no cuenta nada.
//
// Se llama desde dos sitios, una vez por evento:
//  - "reto_abierto": app/r/[id]/contenido.tsx, cuando alguien abre /r/<id> y el reto existe
//    (lo pinta el servidor; ojo: también cuenta las visitas de los bots que leen la vista previa).
//  - "reto_votado": app/api/retos/[id]/voto/route.ts, solo cuando el voto entra por primera vez
//    (registrado: true; los votos repetidos del mismo navegador no cuentan).
//
// Quien lo implemente: que nunca lance ni tarde (la página y el voto no deben esperar a un contador);
// atrapar errores aquí dentro. No guardar el id del votante ni nada que identifique a la persona.

export type EventoReto = "reto_abierto" | "reto_votado";

export interface DatosEventoReto {
  retoId: string;
  /** Solo en "reto_votado": a quién votó. */
  voto?: "pro" | "con";
}

export async function contarEventoReto(evento: EventoReto, datos: DatosEventoReto): Promise<void> {
  void evento;
  void datos;
}
