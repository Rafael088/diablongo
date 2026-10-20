// Migrado a tests/blips.test.ts; este script se mantiene por compatibilidad
/**
 * Script de prueba para la lógica pura de blips (versión compilada).
 * Ejecutar con: node scripts/comprobar-blips.ts o node scripts/comprobar-blips.js
 * Prueba que:
 * 1. shouldPlayBlip toca cada 2 letras (no en espacios/puntuación)
 * 2. getBaseFrequency devuelve las frecuencias correctas
 */

// Implementación inline de shouldPlayBlip
function shouldPlayBlip(text: string, charIndex: number): boolean {
  if (charIndex >= text.length) return false;

  const char = text[charIndex];
  // No tocamos blips en espacios ni puntuación
  if (/[\s\p{P}]/u.test(char)) return false;

  // Contar caracteres "reales" hasta este punto (excluyendo espacios y puntuación)
  let realCount = 0;
  for (let i = 0; i <= charIndex; i++) {
    if (!/[\s\p{P}]/u.test(text[i])) {
      realCount++;
    }
  }

  // Tocar cada 2 caracteres reales (en el 2º, 4º, 6º, etc.)
  return realCount % 2 === 0;
}

// Implementación inline de getBaseFrequency
function getBaseFrequency(speaker: "pro" | "con"): number {
  return speaker === "pro" ? 880 : 220;
}

function blipAlAvanzar(text: string, prev: number, count: number): boolean {
  const avance = count - prev;
  if (avance < 1 || avance > 3) return false;
  return shouldPlayBlip(text, count - 1);
}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

function testShouldPlayBlip() {
  console.log("\n=== Pruebas de shouldPlayBlip ===\n");

  // Test 1: Texto sin espacios ni puntuación
  const text1 = "hola";
  // h (idx 0, real 1): no
  // o (idx 1, real 2): sí
  // l (idx 2, real 3): no
  // a (idx 3, real 4): sí
  assert(!shouldPlayBlip(text1, 0), "Carácter 0 (primera letra): sin blip");
  assert(shouldPlayBlip(text1, 1), "Carácter 1 (segunda letra): con blip");
  assert(!shouldPlayBlip(text1, 2), "Carácter 2 (tercera letra): sin blip");
  assert(shouldPlayBlip(text1, 3), "Carácter 3 (cuarta letra): con blip");

  // Test 2: Texto con espacios (se ignoran)
  const text2 = "hola mundo";
  // h (idx 0, real 1): no
  // o (idx 1, real 2): sí
  // l (idx 2, real 3): no
  // a (idx 3, real 4): sí
  // espacio (idx 4): no (es espacio)
  // m (idx 5, real 5): no
  // u (idx 6, real 6): sí
  // n (idx 7, real 7): no
  // d (idx 8, real 8): sí
  // o (idx 9, real 9): no
  assert(!shouldPlayBlip(text2, 0), "Primera letra de 'hola': sin blip");
  assert(shouldPlayBlip(text2, 1), "Segunda letra de 'hola': con blip");
  assert(shouldPlayBlip(text2, 3), "Cuarta letra de 'hola': con blip");
  assert(!shouldPlayBlip(text2, 4), "Espacio: sin blip (es espacio)");
  assert(!shouldPlayBlip(text2, 5), "Primera letra de 'mundo': sin blip (real 5)");
  assert(shouldPlayBlip(text2, 6), "Segunda letra de 'mundo': con blip (real 6)");

  // Test 3: Texto con puntuación (se ignora)
  const text3 = "hola.";
  // h (idx 0, real 1): no
  // o (idx 1, real 2): sí
  // l (idx 2, real 3): no
  // a (idx 3, real 4): sí
  // . (idx 4): no (es puntuación)
  assert(!shouldPlayBlip(text3, 0), "Primera letra antes de punto: sin blip");
  assert(shouldPlayBlip(text3, 1), "Segunda letra antes de punto: con blip");
  assert(shouldPlayBlip(text3, 3), "Cuarta letra antes de punto: con blip");
  assert(!shouldPlayBlip(text3, 4), "Punto: sin blip (es puntuación)");

  // Test 4: Índice fuera de rango
  assert(!shouldPlayBlip(text1, 4), "Índice fuera de rango: sin blip");
  assert(!shouldPlayBlip(text1, 10), "Índice muy fuera de rango: sin blip");

  // Test 5: Texto vacío
  assert(!shouldPlayBlip("", 0), "Texto vacío: sin blip");

  // Test 6: Solo espacios y puntuación
  const text6 = " . , ! ";
  assert(!shouldPlayBlip(text6, 0), "Espacio inicial: sin blip");
  assert(!shouldPlayBlip(text6, 1), "Punto: sin blip");
  assert(!shouldPlayBlip(text6, 2), "Coma: sin blip");
}

function testGetBaseFrequency() {
  console.log("\n=== Pruebas de getBaseFrequency ===\n");

  const proFreq = getBaseFrequency("pro");
  const conFreq = getBaseFrequency("con");

  assert(proFreq === 880, `Ángel (pro) tiene frecuencia 880 Hz (obtuvo ${proFreq})`);
  assert(conFreq === 220, `Diablo (con) tiene frecuencia 220 Hz (obtuvo ${conFreq})`);
  assert(proFreq > conFreq, "Ángel tiene frecuencia más aguda que Diablo");
  assert(proFreq / conFreq === 4, "Ángel es 4x más agudo que Diablo");
}

function testBlipAlAvanzar() {
  console.log("\n=== Pruebas de blipAlAvanzar ===\n");
  const t = "hola mundo, esto es una frase larga";
  assert(blipAlAvanzar(t, 1, 2) === shouldPlayBlip(t, 1), "avance de 1 letra: según shouldPlayBlip (suena)");
  assert(!blipAlAvanzar(t, 0, 1), "avance de 1 letra sin blip: no suena");
  assert(!blipAlAvanzar(t, 3, t.length), "skip (salto grande): no suena");
  assert(!blipAlAvanzar(t, 5, 5), "sin avance: no suena");
  // Frase nueva: el llamador parte de prev = 0 y suena desde el principio.
  assert(blipAlAvanzar("ab cd", 1, 2), "frase nueva: la 2ª letra suena aunque la anterior fuera larga");
  let sonaron = 0;
  for (let c = 1; c <= t.length; c++) if (blipAlAvanzar(t, c - 1, c)) sonaron++;
  assert(sonaron > 0, "escribiendo letra a letra suenan blips");
}

async function main() {
  console.log("🎮 Pruebas de lógica de blips\n");

  testShouldPlayBlip();
  testGetBaseFrequency();
  testBlipAlAvanzar();

  console.log(`\n=== Resultados ===`);
  console.log(`✓ Pasadas: ${testsPassed}`);
  console.log(`✗ Fallidas: ${testsFailed}`);

  if (testsFailed > 0) {
    console.log("\n❌ Algunas pruebas fallaron");
    process.exit(1);
  } else {
    console.log("\n✅ Todas las pruebas pasaron");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
