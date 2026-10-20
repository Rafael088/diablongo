// Migrado de scripts/comprobar-marcador.ts (mismas aserciones).
import { describe, expect, it } from "vitest";
import {
  MARCADOR_INICIAL,
  crearLectorCacheado,
  leer,
  sumar,
  tituloSegunRecord,
} from "../lib/marcador.ts";

describe("marcador", () => {

  
  // Test 1: MARCADOR_INICIAL
  it("MARCADOR_INICIAL debe tener angel: 0, diablo: 0", () => {
    expect(MARCADOR_INICIAL).toEqual({ angel: 0, diablo: 0 });
  });
  
  // Test 2: sumar angel
  it("sumar(inicial, 'pro') debe devolver {angel: 1, diablo: 0}", () => {
    const resultado = sumar(MARCADOR_INICIAL, "pro");
    expect(resultado).toEqual({ angel: 1, diablo: 0 });
  });
  
  // Test 3: sumar diablo
  it("sumar(inicial, 'con') debe devolver {angel: 0, diablo: 1}", () => {
    const resultado = sumar(MARCADOR_INICIAL, "con");
    expect(resultado).toEqual({ angel: 0, diablo: 1 });
  });
  
  // Test 4: sumar múltiples veces
  it("sumar múltiples veces debe acumular", () => {
    let m = MARCADOR_INICIAL;
    m = sumar(m, "pro");
    m = sumar(m, "pro");
    m = sumar(m, "con");
    expect(m).toEqual({ angel: 2, diablo: 1 });
  });
  
  // Test 5: leer null
  it("leer(null) debe devolver MARCADOR_INICIAL", () => {
    expect(leer(null)).toEqual(MARCADOR_INICIAL);
  });
  
  // Test 6: leer string vacío
  it("leer('') debe devolver MARCADOR_INICIAL", () => {
    expect(leer("")).toEqual(MARCADOR_INICIAL);
  });
  
  // Test 7: leer JSON válido
  it("leer('{\"angel\": 5, \"diablo\": 3}') debe devolver {angel: 5, diablo: 3}", () => {
    expect(leer('{"angel": 5, "diablo": 3}')).toEqual({ angel: 5, diablo: 3 });
  });
  
  // Test 8: leer JSON roto
  it("leer('{invalid json}') debe devolver MARCADOR_INICIAL", () => {
    expect(leer("{invalid json}")).toEqual(MARCADOR_INICIAL);
  });
  
  // Test 9: leer con número negativo en angel
  it("leer('{\"angel\": -1, \"diablo\": 0}') debe devolver MARCADOR_INICIAL", () => {
    expect(leer('{"angel": -1, "diablo": 0}')).toEqual(MARCADOR_INICIAL);
  });
  
  // Test 10: leer con número negativo en diablo
  it("leer('{\"angel\": 0, \"diablo\": -5}') debe devolver MARCADOR_INICIAL", () => {
    expect(leer('{"angel": 0, "diablo": -5}')).toEqual(MARCADOR_INICIAL);
  });
  
  // Test 11: leer con número decimal en angel
  it("leer('{\"angel\": 1.5, \"diablo\": 0}') debe devolver MARCADOR_INICIAL", () => {
    expect(leer('{"angel": 1.5, "diablo": 0}')).toEqual(MARCADOR_INICIAL);
  });
  
  // Test 12: leer con falta de propiedad
  it("leer('{\"angel\": 1}') debe devolver MARCADOR_INICIAL (falta diablo)", () => {
    expect(leer('{"angel": 1}')).toEqual(MARCADOR_INICIAL);
  });
  
  // Test 13: tituloSegunRecord - 0 partidas
  it("tituloSegunRecord({0, 0}) debe ser 'Alma en blanco'", () => {
    expect(tituloSegunRecord({ angel: 0, diablo: 0 })).toEqual("Alma en blanco");
  });
  
  // Test 14: tituloSegunRecord - 1 partida
  it("tituloSegunRecord({1, 0}) debe ser 'Recién llegado'", () => {
    expect(tituloSegunRecord({ angel: 1, diablo: 0 })).toEqual("Recién llegado");
  });
  
  // Test 15: tituloSegunRecord - 2 partidas
  it("tituloSegunRecord({1, 1}) debe ser 'Recién llegado'", () => {
    expect(tituloSegunRecord({ angel: 1, diablo: 1 })).toEqual("Recién llegado");
  });
  
  // Test 16: tituloSegunRecord - 80% diablo (4 de 5)
  it("tituloSegunRecord({1, 4}) debe ser 'Eres un caso perdido' (80% diablo)", () => {
    expect(tituloSegunRecord({ angel: 1, diablo: 4 })).toEqual("Eres un caso perdido");
  });
  
  // Test 17: tituloSegunRecord - 60% diablo (3 de 5)
  it("tituloSegunRecord({2, 3}) debe ser 'Te dejas tentar' (60% diablo)", () => {
    expect(tituloSegunRecord({ angel: 2, diablo: 3 })).toEqual("Te dejas tentar");
  });
  
  // Test 18: tituloSegunRecord - 80% ángel (4 de 5)
  it("tituloSegunRecord({4, 1}) debe ser 'Santo de altar' (80% ángel)", () => {
    expect(tituloSegunRecord({ angel: 4, diablo: 1 })).toEqual("Santo de altar");
  });
  
  // Test 19: tituloSegunRecord - 60% ángel (3 de 5)
  it("tituloSegunRecord({3, 2}) debe ser 'Buena gente' (60% ángel)", () => {
    expect(tituloSegunRecord({ angel: 3, diablo: 2 })).toEqual("Buena gente");
  });
  
  // Test 20: tituloSegunRecord - 50/50
  it("tituloSegunRecord({2, 2}) debe ser 'Ni frío ni caliente' (50/50)", () => {
    expect(tituloSegunRecord({ angel: 2, diablo: 2 })).toEqual("Ni frío ni caliente");
  });
  
  // Test 21: tituloSegunRecord - 55% ángel
  it("tituloSegunRecord({11, 9}) debe ser 'Ni frío ni caliente' (55% ángel)", () => {
    expect(tituloSegunRecord({ angel: 11, diablo: 9 })).toEqual("Ni frío ni caliente");
  });
  
  // Test 22: tituloSegunRecord - exacto 80% ángel
  it("tituloSegunRecord({8, 2}) debe ser 'Santo de altar' (exacto 80%)", () => {
    expect(tituloSegunRecord({ angel: 8, diablo: 2 })).toEqual("Santo de altar");
  });
  
  // Test 23: tituloSegunRecord - exacto 80% diablo
  it("tituloSegunRecord({2, 8}) debe ser 'Eres un caso perdido' (exacto 80%)", () => {
    expect(tituloSegunRecord({ angel: 2, diablo: 8 })).toEqual("Eres un caso perdido");
  });
  
  // Test 24: tituloSegunRecord - justo bajo 60% ángel
  it("tituloSegunRecord({10, 7}) debe ser 'Ni frío ni caliente' (59% ángel)", () => {
    expect(tituloSegunRecord({ angel: 10, diablo: 7 })).toEqual("Ni frío ni caliente");
  });
  
  // Caché del lector (evita el bucle de useSyncExternalStore)
  it("crearLectorCacheado: mismo texto crudo devuelve el mismo objeto (===)", () => {
    const lector = crearLectorCacheado();
    const a = lector('{"angel": 3, "diablo": 5}');
    const b = lector('{"angel": 3, "diablo": 5}');
    expect(a).toBe(b);
    expect(a).toEqual({ angel: 3, diablo: 5 });
  });
  
  it("crearLectorCacheado: null repetido devuelve el mismo objeto", () => {
    const lector = crearLectorCacheado();
    expect(lector(null)).toBe(lector(null));
  });
  
  it("crearLectorCacheado: texto distinto devuelve valor nuevo", () => {
    const lector = crearLectorCacheado();
    const a = lector('{"angel": 1, "diablo": 0}');
    const b = lector('{"angel": 2, "diablo": 0}');
    expect(b).toEqual({ angel: 2, diablo: 0 });
    expect(a).not.toBe(b);
  });
  
  it("leer descarta campos extra", () => {
    expect(Object.keys(leer('{"angel": 1, "diablo": 2, "x": 9}')).sort()).toEqual(["angel", "diablo"]);
  });
});
