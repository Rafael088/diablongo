/**
 * Script de comprobación del marcador.
 * Ejecutar con: node scripts/comprobar-marcador.ts
 */

import {
  MARCADOR_INICIAL,
  crearLectorCacheado,
  leer,
  sumar,
  tituloSegunRecord,
} from "../lib/marcador.ts";

let passed = 0;
let failed = 0;

function test(nombre: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${nombre}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${nombre}: ${e}`);
    failed++;
  }
}

function eq<T>(a: T, b: T, msg?: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

console.log("=== Comprobar marcador ===\n");

// Test 1: MARCADOR_INICIAL
test("MARCADOR_INICIAL debe tener angel: 0, diablo: 0", () => {
  eq(MARCADOR_INICIAL, { angel: 0, diablo: 0 });
});

// Test 2: sumar angel
test("sumar(inicial, 'pro') debe devolver {angel: 1, diablo: 0}", () => {
  const resultado = sumar(MARCADOR_INICIAL, "pro");
  eq(resultado, { angel: 1, diablo: 0 });
});

// Test 3: sumar diablo
test("sumar(inicial, 'con') debe devolver {angel: 0, diablo: 1}", () => {
  const resultado = sumar(MARCADOR_INICIAL, "con");
  eq(resultado, { angel: 0, diablo: 1 });
});

// Test 4: sumar múltiples veces
test("sumar múltiples veces debe acumular", () => {
  let m = MARCADOR_INICIAL;
  m = sumar(m, "pro");
  m = sumar(m, "pro");
  m = sumar(m, "con");
  eq(m, { angel: 2, diablo: 1 });
});

// Test 5: leer null
test("leer(null) debe devolver MARCADOR_INICIAL", () => {
  eq(leer(null), MARCADOR_INICIAL);
});

// Test 6: leer string vacío
test("leer('') debe devolver MARCADOR_INICIAL", () => {
  eq(leer(""), MARCADOR_INICIAL);
});

// Test 7: leer JSON válido
test("leer('{\"angel\": 5, \"diablo\": 3}') debe devolver {angel: 5, diablo: 3}", () => {
  eq(leer('{"angel": 5, "diablo": 3}'), { angel: 5, diablo: 3 });
});

// Test 8: leer JSON roto
test("leer('{invalid json}') debe devolver MARCADOR_INICIAL", () => {
  eq(leer("{invalid json}"), MARCADOR_INICIAL);
});

// Test 9: leer con número negativo en angel
test("leer('{\"angel\": -1, \"diablo\": 0}') debe devolver MARCADOR_INICIAL", () => {
  eq(leer('{"angel": -1, "diablo": 0}'), MARCADOR_INICIAL);
});

// Test 10: leer con número negativo en diablo
test("leer('{\"angel\": 0, \"diablo\": -5}') debe devolver MARCADOR_INICIAL", () => {
  eq(leer('{"angel": 0, "diablo": -5}'), MARCADOR_INICIAL);
});

// Test 11: leer con número decimal en angel
test("leer('{\"angel\": 1.5, \"diablo\": 0}') debe devolver MARCADOR_INICIAL", () => {
  eq(leer('{"angel": 1.5, "diablo": 0}'), MARCADOR_INICIAL);
});

// Test 12: leer con falta de propiedad
test("leer('{\"angel\": 1}') debe devolver MARCADOR_INICIAL (falta diablo)", () => {
  eq(leer('{"angel": 1}'), MARCADOR_INICIAL);
});

// Test 13: tituloSegunRecord - 0 partidas
test("tituloSegunRecord({0, 0}) debe ser 'Alma en blanco'", () => {
  eq(tituloSegunRecord({ angel: 0, diablo: 0 }), "Alma en blanco");
});

// Test 14: tituloSegunRecord - 1 partida
test("tituloSegunRecord({1, 0}) debe ser 'Recién llegado'", () => {
  eq(tituloSegunRecord({ angel: 1, diablo: 0 }), "Recién llegado");
});

// Test 15: tituloSegunRecord - 2 partidas
test("tituloSegunRecord({1, 1}) debe ser 'Recién llegado'", () => {
  eq(tituloSegunRecord({ angel: 1, diablo: 1 }), "Recién llegado");
});

// Test 16: tituloSegunRecord - 80% diablo (4 de 5)
test("tituloSegunRecord({1, 4}) debe ser 'Eres un caso perdido' (80% diablo)", () => {
  eq(tituloSegunRecord({ angel: 1, diablo: 4 }), "Eres un caso perdido");
});

// Test 17: tituloSegunRecord - 60% diablo (3 de 5)
test("tituloSegunRecord({2, 3}) debe ser 'Te dejas tentar' (60% diablo)", () => {
  eq(tituloSegunRecord({ angel: 2, diablo: 3 }), "Te dejas tentar");
});

// Test 18: tituloSegunRecord - 80% ángel (4 de 5)
test("tituloSegunRecord({4, 1}) debe ser 'Santo de altar' (80% ángel)", () => {
  eq(tituloSegunRecord({ angel: 4, diablo: 1 }), "Santo de altar");
});

// Test 19: tituloSegunRecord - 60% ángel (3 de 5)
test("tituloSegunRecord({3, 2}) debe ser 'Buena gente' (60% ángel)", () => {
  eq(tituloSegunRecord({ angel: 3, diablo: 2 }), "Buena gente");
});

// Test 20: tituloSegunRecord - 50/50
test("tituloSegunRecord({2, 2}) debe ser 'Ni frío ni caliente' (50/50)", () => {
  eq(tituloSegunRecord({ angel: 2, diablo: 2 }), "Ni frío ni caliente");
});

// Test 21: tituloSegunRecord - 55% ángel
test("tituloSegunRecord({11, 9}) debe ser 'Ni frío ni caliente' (55% ángel)", () => {
  eq(tituloSegunRecord({ angel: 11, diablo: 9 }), "Ni frío ni caliente");
});

// Test 22: tituloSegunRecord - exacto 80% ángel
test("tituloSegunRecord({8, 2}) debe ser 'Santo de altar' (exacto 80%)", () => {
  eq(tituloSegunRecord({ angel: 8, diablo: 2 }), "Santo de altar");
});

// Test 23: tituloSegunRecord - exacto 80% diablo
test("tituloSegunRecord({2, 8}) debe ser 'Eres un caso perdido' (exacto 80%)", () => {
  eq(tituloSegunRecord({ angel: 2, diablo: 8 }), "Eres un caso perdido");
});

// Test 24: tituloSegunRecord - justo bajo 60% ángel
test("tituloSegunRecord({10, 7}) debe ser 'Ni frío ni caliente' (59% ángel)", () => {
  eq(tituloSegunRecord({ angel: 10, diablo: 7 }), "Ni frío ni caliente");
});

// Caché del lector (evita el bucle de useSyncExternalStore)
test("crearLectorCacheado: mismo texto crudo devuelve el mismo objeto (===)", () => {
  const lector = crearLectorCacheado();
  const a = lector('{"angel": 3, "diablo": 5}');
  const b = lector('{"angel": 3, "diablo": 5}');
  if (a !== b) throw new Error("devolvió objetos distintos");
  eq(a, { angel: 3, diablo: 5 });
});

test("crearLectorCacheado: null repetido devuelve el mismo objeto", () => {
  const lector = crearLectorCacheado();
  if (lector(null) !== lector(null)) throw new Error("devolvió objetos distintos");
});

test("crearLectorCacheado: texto distinto devuelve valor nuevo", () => {
  const lector = crearLectorCacheado();
  const a = lector('{"angel": 1, "diablo": 0}');
  const b = lector('{"angel": 2, "diablo": 0}');
  eq(b, { angel: 2, diablo: 0 });
  if (a === b) throw new Error("no recalculó");
});

test("leer descarta campos extra", () => {
  eq(Object.keys(leer('{"angel": 1, "diablo": 2, "x": 9}')).sort(), ["angel", "diablo"]);
});

console.log(`\n=== Resultado ===`);
console.log(`Pasados: ${passed}`);
console.log(`Fallidos: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
