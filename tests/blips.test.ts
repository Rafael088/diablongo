// Migrado de scripts/comprobar-blips.ts, pero probando la función real de lib/blips.ts.
import { describe, expect, it } from "vitest";
import { blipAlAvanzar, getBaseFrequency, shouldPlayBlip } from "../lib/blips.ts";

describe("shouldPlayBlip", () => {
  it("texto sin espacios: suena cada 2 letras", () => {
    const t = "hola";
    expect(shouldPlayBlip(t, 0)).toBe(false);
    expect(shouldPlayBlip(t, 1)).toBe(true);
    expect(shouldPlayBlip(t, 2)).toBe(false);
    expect(shouldPlayBlip(t, 3)).toBe(true);
  });

  it("los espacios no cuentan ni suenan", () => {
    const t = "hola mundo";
    expect(shouldPlayBlip(t, 0)).toBe(false);
    expect(shouldPlayBlip(t, 1)).toBe(true);
    expect(shouldPlayBlip(t, 3)).toBe(true);
    expect(shouldPlayBlip(t, 4)).toBe(false);
    expect(shouldPlayBlip(t, 5)).toBe(false);
    expect(shouldPlayBlip(t, 6)).toBe(true);
  });

  it("la puntuación no cuenta ni suena", () => {
    const t = "hola.";
    expect(shouldPlayBlip(t, 0)).toBe(false);
    expect(shouldPlayBlip(t, 1)).toBe(true);
    expect(shouldPlayBlip(t, 3)).toBe(true);
    expect(shouldPlayBlip(t, 4)).toBe(false);
  });

  it("índice fuera de rango, texto vacío o solo signos: sin blip", () => {
    expect(shouldPlayBlip("hola", 4)).toBe(false);
    expect(shouldPlayBlip("hola", 10)).toBe(false);
    expect(shouldPlayBlip("", 0)).toBe(false);
    for (const i of [0, 1, 2]) expect(shouldPlayBlip(" . , ! ", i)).toBe(false);
  });
});

describe("getBaseFrequency", () => {
  it("Ángel 880 Hz, Diablo 220 Hz, cuatro veces más agudo", () => {
    expect(getBaseFrequency("pro")).toBe(880);
    expect(getBaseFrequency("con")).toBe(220);
    expect(getBaseFrequency("pro") / getBaseFrequency("con")).toBe(4);
  });
});

describe("blipAlAvanzar", () => {
  const t = "hola mundo, esto es una frase larga";
  it("avance de una letra: según shouldPlayBlip", () => {
    expect(blipAlAvanzar(t, 1, 2)).toBe(shouldPlayBlip(t, 1));
    expect(blipAlAvanzar(t, 0, 1)).toBe(false);
  });
  it("saltos grandes y sin avance: no suena", () => {
    expect(blipAlAvanzar(t, 3, t.length)).toBe(false);
    expect(blipAlAvanzar(t, 5, 5)).toBe(false);
  });
  it("frase nueva: la 2ª letra suena", () => {
    expect(blipAlAvanzar("ab cd", 1, 2)).toBe(true);
  });
  it("escribiendo letra a letra suenan blips", () => {
    let sonaron = 0;
    for (let c = 1; c <= t.length; c++) if (blipAlAvanzar(t, c - 1, c)) sonaron++;
    expect(sonaron).toBeGreaterThan(0);
  });
});
