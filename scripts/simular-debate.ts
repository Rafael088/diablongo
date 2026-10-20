// Simula un debate completo con el motor, sin llamar a ningún modelo.
// Uso: node scripts/simular-debate.ts   (Node 22.18+ ejecuta TypeScript directo)
//  o:  npx tsx scripts/simular-debate.ts
import {
  TOTAL_TURNS,
  INTERVENTION_AFTER_TURN,
  getInitialTurn,
  getNextTurn,
  shouldPauseForIntervention,
  canIntervene,
  mergeIntervention,
} from "../lib/debateEngine.ts";
import type { Turn } from "../lib/debateEngine.ts";

const errores: string[] = [];
const fallar = (m: string) => errores.push(m);

const nombre = { pro: "Ángel", con: "Diablo" } as const;
const turnos: Turn[] = [];
const llamadas: { turn: Turn; intervention?: string }[] = [];
let pendiente: string | undefined;
let pausas = 0;

let turn: Turn | null = getInitialTurn();
while (turn && turnos.length < 50) {
  llamadas.push({ turn, intervention: pendiente });
  pendiente = undefined;
  turnos.push(turn);
  const hechos = turnos.length;
  turn = getNextTurn(hechos);
  if (shouldPauseForIntervention(hechos)) {
    pausas++;
    // el usuario interviene en la pausa: NO es una llamada extra
    if (!canIntervene(hechos)) fallar("no deja intervenir a mitad");
    pendiente = mergeIntervention(pendiente, "  ¿y si lo dejo para mañana?  ");
    pendiente = mergeIntervention(pendiente, "mejor hoy");
  }
}
if (canIntervene(turnos.length)) fallar("deja intervenir con el debate terminado");

console.log(`Debate simulado: ${llamadas.length} llamadas (TOTAL_TURNS=${TOTAL_TURNS})`);
llamadas.forEach(({ turn: t, intervention }, i) => {
  console.log(
    `${i + 1}. ${nombre[t.nextSpeaker]} · ${t.phase} · ronda ${t.round}` +
      (intervention ? `  [lleva la intervención: "${intervention}"]` : "")
  );
  if (shouldPauseForIntervention(i + 1)) console.log("   -- pausa de mitad: el usuario puede intervenir --");
});

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
const conInt = llamadas.filter((l) => l.intervention);
if (conInt.length !== 1 || llamadas.indexOf(conInt[0]) !== INTERVENTION_AFTER_TURN)
  fallar("la intervención debe llegar en el turno 5");
if (conInt[0]?.intervention !== "¿y si lo dejo para mañana? mejor hoy") fallar("no se juntaron bien las intervenciones");
if (getNextTurn(TOTAL_TURNS) !== null) fallar("debe terminar tras el turno 8");

if (errores.length) {
  console.error("\nFALLO:\n- " + errores.join("\n- "));
  process.exit(1);
}
console.log("\nOK: 8 llamadas, alternancia correcta, intervención sin llamadas extra.");
