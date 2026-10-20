// Migrado de scripts/comprobar-tentacion.ts (mismas aserciones).
import { describe, expect, it } from "vitest";
import { PASO, TOPE, MINIMO, VALOR_INICIAL, aplicarVoto, quienGana, valorDeVotos } from "../lib/tentacion.ts";

describe("tentación", () => {
  it("empieza en el centro y es empate", () => {
    expect(VALOR_INICIAL).toBe(0);
    expect(quienGana(VALOR_INICIAL)).toBe("empate");
  });

  it("votar al Ángel mueve a la izquierda y al Diablo a la derecha", () => {
    expect(aplicarVoto(0, "pro")).toBeLessThan(0);
    expect(quienGana(aplicarVoto(0, "pro"))).toBe("pro");
    expect(aplicarVoto(0, "con")).toBeGreaterThan(0);
    expect(quienGana(aplicarVoto(0, "con"))).toBe("con");
  });

  it("respeta los topes en +100 y -100", () => {
    let v = 0;
    for (let i = 0; i < 20; i++) v = aplicarVoto(v, "con");
    expect(v).toBe(TOPE);
    v = 0;
    for (let i = 0; i < 20; i++) v = aplicarVoto(v, "pro");
    expect(v).toBe(MINIMO);
  });

  it("con 4 votos al mismo bando se llega justo al extremo; con 3 no", () => {
    let v = 0;
    for (let i = 0; i < 4; i++) v = aplicarVoto(v, "pro");
    expect(v).toBe(MINIMO);
    expect(3 * PASO).toBeLessThan(TOPE);
  });

  it("un voto a cada lado empata", () => {
    expect(quienGana(aplicarVoto(aplicarVoto(0, "pro"), "con"))).toBe("empate");
  });

  it("valorDeVotos cuenta por índice, una vez, e ignora al usuario", () => {
    const bandos = ["pro", "con", "user", "pro"];
    expect(valorDeVotos(bandos, [0, 1])).toBe(0);
    expect(valorDeVotos(bandos, [0, 0, 0])).toBe(-PASO);
    expect(valorDeVotos(bandos, [2])).toBe(0);
    expect(valorDeVotos(bandos, [0, 3])).toBe(-2 * PASO);
  });
});
