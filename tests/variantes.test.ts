import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PERSONALIDAD_CLASICA, TODAS_LAS_PERSONALIDADES, nombreVisible } from "../lib/personalidades.ts";
import { PALETA_SPRITES, SPRITES, TAMANO_SPRITE, TRANSPARENTE, matrizDe } from "../lib/sprites/index.ts";
import { idsConVariante, matrizVariante } from "../lib/sprites/variantes.ts";
import type { FotogramaDebatiente } from "../lib/sprites/tipos.ts";

const FOTOGRAMAS: FotogramaDebatiente[] = ["reposo", "hablar", "golpe", "victoria"];
const paleta = new Set<string>([TRANSPARENTE, ...Object.keys(PALETA_SPRITES)]);

describe("variantes de personalidad", () => {
  it("cada id del catálogo tiene variante y no sobra ninguna", () => {
    expect(idsConVariante().sort()).toEqual(TODAS_LAS_PERSONALIDADES.map((p) => p.id).sort());
  });

  for (const p of TODAS_LAS_PERSONALIDADES) {
    for (const f of FOTOGRAMAS) {
      it(`${p.id}/${f}: 32×32 y solo colores de la paleta`, () => {
        const m = matrizVariante(p.rol, p.id, f);
        expect(m.length).toBe(TAMANO_SPRITE);
        const fuera: string[] = [];
        m.forEach((fila, y) => {
          expect(fila.length, `fila ${y}`).toBe(TAMANO_SPRITE);
          [...fila].forEach((c, x) => {
            if (!paleta.has(c)) fuera.push(`(${x},${y}) "${c}"`);
          });
        });
        expect(fuera).toEqual([]);
      });
    }
    if (p.id !== PERSONALIDAD_CLASICA[p.rol]) {
      it(`${p.id}: se distingue del clásico en cada fotograma`, () => {
        for (const f of FOTOGRAMAS) {
          expect(matrizVariante(p.rol, p.id, f)).not.toEqual(SPRITES[p.rol][f]);
        }
      });
    }
  }

  it("las variantes no se parecen entre sí dentro de un mismo personaje", () => {
    for (const rol of ["pro", "con"] as const) {
      const firmas = TODAS_LAS_PERSONALIDADES.filter((p) => p.rol === rol).map((p) =>
        matrizVariante(rol, p.id, "reposo").join("|"),
      );
      expect(new Set(firmas).size).toBe(firmas.length);
    }
  });

  it("la clásica devuelve exactamente la matriz base, en todos los fotogramas", () => {
    for (const rol of ["pro", "con"] as const) {
      for (const f of FOTOGRAMAS) {
        expect(matrizVariante(rol, PERSONALIDAD_CLASICA[rol], f)).toEqual(SPRITES[rol][f]);
        expect(matrizDe(rol, f, PERSONALIDAD_CLASICA[rol])).toEqual(SPRITES[rol][f]);
        expect(matrizDe(rol, f)).toEqual(SPRITES[rol][f]);
      }
    }
  });

  it("un id desconocido o sin personalidad cae al sprite clásico", () => {
    expect(matrizVariante("pro", "no-existe", "reposo")).toEqual(SPRITES.pro.reposo);
    expect(matrizVariante("con", undefined, "golpe")).toEqual(SPRITES.con.golpe);
  });

  it("los sprites base no cambiaron (huella fija)", () => {
    const huella = (rol: "pro" | "con") =>
      createHash("sha256").update(FOTOGRAMAS.map((f) => SPRITES[rol][f].join("\n")).join("\n--\n")).digest("hex");
    // Si estas huellas cambian, alguien tocó ANGEL o DIABLO: la clásica ya no se vería igual que antes.
    expect(huella("pro")).toBe(HUELLA_ANGEL);
    expect(huella("con")).toBe(HUELLA_DIABLO);
  });

  it("nombreVisible: la clásica conserva «Ángel»/«Diablo» y las demás su nombre del catálogo", () => {
    expect(nombreVisible("pro", undefined)).toBe("Ángel");
    expect(nombreVisible("pro", "angel-clasico")).toBe("Ángel");
    expect(nombreVisible("con", "diablo-clasico")).toBe("Diablo");
    expect(nombreVisible("pro", "angel-abuela")).toBe("Abuela");
    expect(nombreVisible("con", "diablo-narco")).toBe("Narco de novela");
    // un id del otro rol o desconocido no se cuela
    expect(nombreVisible("pro", "diablo-narco")).toBe("Ángel");
    expect(nombreVisible("con", "x")).toBe("Diablo");
  });
});

const HUELLA_ANGEL = "bcbe2aa312aa035171d7ff692bd67aaa8e932cb227fc87328f85e240f4189929";
const HUELLA_DIABLO = "5f3ecf28f8c4773f62df0ae273a9a9584ff90780c7cfd42d674fdd81ceefed56";
