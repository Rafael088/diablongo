// Comprueba lib/tentacion.ts. Uso: node scripts/comprobar-tentacion.ts
import {
  PASO,
  TOPE,
  MINIMO,
  VALOR_INICIAL,
  aplicarVoto,
  quienGana,
  valorDeVotos,
} from "../lib/tentacion.ts";
import type { Ganando } from "../lib/tentacion.ts";

let fallos = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? "OK   " : "FALLA"} ${msg}`);
  if (!cond) fallos++;
}

ok(VALOR_INICIAL === 0, "empieza en el centro");
const g0: Ganando = quienGana(VALOR_INICIAL);
ok(g0 === "empate", "al inicio es empate");
ok(aplicarVoto(0, "pro") < 0 && quienGana(aplicarVoto(0, "pro")) === "pro", "votar al Ángel mueve a la izquierda");
ok(aplicarVoto(0, "con") > 0 && quienGana(aplicarVoto(0, "con")) === "con", "votar al Diablo mueve a la derecha");

let v = 0;
for (let i = 0; i < 20; i++) v = aplicarVoto(v, "con");
ok(v === TOPE, "tope en +100");
v = 0;
for (let i = 0; i < 20; i++) v = aplicarVoto(v, "pro");
ok(v === MINIMO, "tope en -100");

v = 0;
for (let i = 0; i < 8; i++) v = aplicarVoto(v, "pro");
ok(v === MINIMO, "con 8 frases del mismo bando se llega justo al extremo");
ok(7 * PASO < TOPE, "con 7 frases aún no se llega");

ok(quienGana(aplicarVoto(aplicarVoto(0, "pro"), "con")) === "empate", "un voto a cada lado empata");

const bandos = ["pro", "con", "user", "pro"];
ok(valorDeVotos(bandos, [0, 1]) === 0, "votos por índice: pro + con = empate");
ok(valorDeVotos(bandos, [0, 0, 0]) === -PASO, "un índice cuenta una sola vez");
ok(valorDeVotos(bandos, [2]) === 0, "las frases del usuario no cuentan");
ok(valorDeVotos(bandos, [0, 3]) === -2 * PASO, "dos votos al Ángel");

if (fallos > 0) {
  console.error(`${fallos} comprobaciones fallaron`);
  process.exit(1);
}
console.log("Todo bien");
