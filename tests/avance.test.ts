import { describe, expect, it } from "vitest";
import { accionTrasLeer, teclaAvanza } from "../lib/avance.ts";
import { TOTAL_TURNS } from "../lib/debateEngine.ts";

describe("accionTrasLeer", () => {
  it("tras el último turno termina sin esperar clic", () => {
    expect(accionTrasLeer(TOTAL_TURNS)).toBe("terminar");
  });

  it("a la mitad del debate pausa para intervenir", () => {
    expect(accionTrasLeer(4)).toBe("pausar");
  });

  it("en cualquier otro turno espera a que pulsen «Siguiente»", () => {
    for (let i = 1; i < TOTAL_TURNS; i++) {
      if (i === 4) continue;
      expect(accionTrasLeer(i)).toBe("esperar-siguiente");
    }
  });
});

describe("teclaAvanza", () => {
  it("Enter y espacio avanzan con el foco en el cuerpo de la página", () => {
    expect(teclaAvanza("Enter", { tagName: "BODY" })).toBe(true);
    expect(teclaAvanza(" ", { tagName: "DIV" })).toBe(true);
    expect(teclaAvanza("Enter", null)).toBe(true);
  });

  it("otras teclas no avanzan", () => {
    expect(teclaAvanza("a", { tagName: "BODY" })).toBe(false);
    expect(teclaAvanza("Escape")).toBe(false);
  });

  it("no se disparan al escribir en el campo de intervención", () => {
    expect(teclaAvanza("Enter", { tagName: "INPUT" })).toBe(false);
    expect(teclaAvanza(" ", { tagName: "input" })).toBe(false);
    expect(teclaAvanza(" ", { tagName: "TEXTAREA" })).toBe(false);
    expect(teclaAvanza(" ", { tagName: "DIV", isContentEditable: true })).toBe(false);
  });

  it("no pisan botones ni enlaces (el 👍 no avanza con Enter)", () => {
    expect(teclaAvanza("Enter", { tagName: "BUTTON" })).toBe(false);
    expect(teclaAvanza(" ", { tagName: "A" })).toBe(false);
  });
});
