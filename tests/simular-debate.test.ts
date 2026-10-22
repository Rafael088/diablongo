// Migrado de scripts/simular-debate.ts (mismas aserciones, sin imprimir el recorrido).
import { expect, it } from "vitest";
import {
  TOTAL_TURNS,
  INTERVENTION_AFTER_TURN,
  getInitialTurn,
  getNextTurn,
  shouldPauseForIntervention,
  canIntervene,
  countTurnsPlayed,
  pendingIntervention,
  TOTAL_LLAMADAS,
} from "../lib/debateEngine.ts";
import type { Turn } from "../lib/debateEngine.ts";
import { buildUserPrompt, MAX_WORDS_DESENLACE } from "../lib/prompts.ts";
import { contarPalabras, limpiarDesenlace, nombreArchivoTarjeta, plantillaDesenlace } from "../lib/desenlace.ts";
import type { DebateMessage } from "../types/index.ts";

const errores: string[] = [];
const fallar = (m: string) => errores.push(m);

const turnos: Turn[] = [];
const llamadas: { turn: Turn; intervention?: string; prompt: string }[] = [];
const messages: DebateMessage[] = [];
let pausas = 0;

let turn: Turn | null = getInitialTurn();
while (turn && turnos.length < 50) {
  // igual que la arena: la intervención sale del historial, no de un estado aparte
  const intervention = pendingIntervention(messages, turn.nextSpeaker);
  const prompt = buildUserPrompt("¿pido pizza?", turn.nextSpeaker, turn.phase, messages, intervention);
  llamadas.push({ turn, intervention, prompt });
  turnos.push(turn);
  messages.push({ role: turn.nextSpeaker, content: `respuesta ${turnos.length}`, round: turn.round, phase: turn.phase });
  const hechos = countTurnsPlayed(messages);
  turn = getNextTurn(hechos);
  if (shouldPauseForIntervention(hechos)) {
    pausas++;
    // el usuario interviene en la pausa (dos veces): NO es una llamada extra
    if (!canIntervene(hechos)) fallar("no deja intervenir a mitad");
    for (const content of ["  ¿y si lo dejo para mañana?  ", "mejor hoy"]) {
      messages.push({ role: "user", content: content.trim(), round: 2, phase: "intervention" });
    }
  }
}
if (canIntervene(countTurnsPlayed(messages))) fallar("deja intervenir con el debate terminado");


it("simula un debate completo sin llamar a ningún modelo", () => {
  if (turnos.length !== TOTAL_TURNS || TOTAL_TURNS !== 8) fallar(`debían ser 8 turnos y son ${turnos.length}`);
  turnos.forEach((t, i) => {
    if (t.index !== i) fallar(`índice incorrecto en turno ${i + 1}`);
    if (t.nextSpeaker !== (i % 2 === 0 ? "pro" : "con")) fallar(`alternancia rota en turno ${i + 1}`);
  });
  const fases = turnos.map((t) => t.phase).join(",");
  const esperadas = "opening,opening,rebuttal,rebuttal,rebuttal,rebuttal,closing,closing";
  if (fases !== esperadas) fallar(`fases: ${fases}`);
  if (turnos[0].nextSpeaker !== "pro") fallar("debe abrir Ángel");
  if (turnos[7].nextSpeaker !== "con") fallar("debe cerrar Diablo");
  if (pausas !== 1 || INTERVENTION_AFTER_TURN !== 4) fallar("debe haber una sola pausa tras el turno 4");
  const esperadaInt = "¿y si lo dejo para mañana? mejor hoy";
  const conInt = llamadas.map((l, i) => (l.intervention ? i + 1 : 0)).filter(Boolean);
  if (conInt.join(",") !== "5,6") fallar(`la intervención debe llegar solo en los turnos 5 y 6 y llegó en: ${conInt.join(",")}`);
  for (const n of [5, 6]) {
    const l = llamadas[n - 1];
    if (l.intervention !== esperadaInt) fallar(`el turno ${n} no recibió la intervención junta`);
    if (!l.prompt.includes(esperadaInt) || !l.prompt.includes("responderle")) fallar(`el prompt del turno ${n} no pide responder al usuario`);
  }
  if (!llamadas[5].prompt.includes("[USUARIO] mejor hoy")) fallar("el historial del turno 6 no contiene [USUARIO]");
  if (!llamadas[6].prompt.includes("[USUARIO]") || llamadas[6].intervention) fallar("el turno 7 debe ver [USUARIO] en el historial pero no repetir la intervención");
  if (messages.filter((m) => m.role === "user").length !== 2) fallar("el historial debe conservar los mensajes del usuario");
  if (countTurnsPlayed(messages) !== 8) fallar("los mensajes del usuario no deben contar como turnos");
  if (getNextTurn(TOTAL_TURNS) !== null) fallar("debe terminar tras el turno 8");

  // Llamada 9: el desenlace cuenta dentro del mismo debate.
  if (TOTAL_LLAMADAS !== TOTAL_TURNS + 1) fallar("TOTAL_LLAMADAS debe ser TOTAL_TURNS + 1");
  const tema = "¿Me compro unos rines de 17?";
  for (const [quien, nom] of [["pro", "ÁNGEL"], ["con", "DIABLO"]] as const) {
    const p = buildUserPrompt(tema, quien, "desenlace", messages);
    if (!p.includes(`máximo ${MAX_WORDS_DESENLACE} palabras`) || MAX_WORDS_DESENLACE !== 20) fallar(`desenlace de ${nom}: no pide máximo 20 palabras`);
    if (p.includes("máximo 35 palabras")) fallar(`desenlace de ${nom}: mezcla el tope de 35`);
    if (!p.includes(`Tu personaje: ${nom}`) || !p.includes(`(${nom})`)) fallar(`desenlace de ${nom}: no nombra al elegido`);
    if (!p.includes("delicado")) fallar(`desenlace de ${nom}: falta el freno en temas delicados`);
    const plantilla = plantillaDesenlace(tema, quien);
    if (!plantilla.trim() || !plantilla.includes("rines de 17")) fallar(`plantilla de ${nom} vacía o sin el tema: "${plantilla}"`);
    if (!plantilla.includes(quien === "pro" ? "Angelito" : "Diablito")) fallar(`plantilla de ${nom} no nombra al elegido`);
  }
  if (contarPalabras(limpiarDesenlace("uno ".repeat(40))) > MAX_WORDS_DESENLACE) fallar("limpiarDesenlace no recorta a 20 palabras");
  if (nombreArchivoTarjeta("¿Me compro unos rines de 17?/\\..") !== "diablongo-me-compro-unos-rines-de-17.png") fallar(`nombre de archivo mal saneado: ${nombreArchivoTarjeta("¿Me compro unos rines de 17?/\\..")}`);
  expect(errores).toEqual([]);
});
