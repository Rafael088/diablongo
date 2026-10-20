// Keys de API del usuario, una por proveedor (no por Ángel/Diablo: si los dos usan
// el mismo proveedor, comparten key).
//
// - Por defecto viven en sessionStorage: se borran al cerrar la pestaña.
// - Solo si la persona marca «Recordar en este dispositivo» van a localStorage,
//   en texto plano. No se finge cifrado: el navegador no tiene dónde esconder un secreto.
// - Si una key existe en ambos almacenes, gana sessionStorage (es lo más reciente
//   que la persona escribió en esta pestaña).
// - Todo acceso va en try/catch (modo privado, storage bloqueado) y nunca se
//   imprime ni se incluye una key en mensajes de error.

export const PREFIJO_KEY = "agent-debate-key:";

export const AVISO_RECORDAR =
  "Se guarda sin cifrar en este navegador. No lo marques en un equipo compartido.";

export interface Almacenes {
  sesion: Storage | null;
  local: Storage | null;
}

function acceso(obtener: () => Storage): Storage | null {
  try {
    return obtener();
  } catch {
    return null;
  }
}

export function almacenesDelNavegador(): Almacenes {
  if (typeof window === "undefined") return { sesion: null, local: null };
  return {
    sesion: acceso(() => window.sessionStorage),
    local: acceso(() => window.localStorage),
  };
}

function nombre(proveedor: string): string {
  return PREFIJO_KEY + proveedor;
}

function leerDe(s: Storage | null, clave: string): string | null {
  if (!s) return null;
  try {
    return s.getItem(clave);
  } catch {
    return null;
  }
}

function borrarDe(s: Storage | null, clave: string): void {
  if (!s) return;
  try {
    s.removeItem(clave);
  } catch {
    // storage bloqueado: no hay nada más que hacer
  }
}

function escribirEn(s: Storage | null, clave: string, valor: string): boolean {
  if (!s) return false;
  try {
    s.setItem(clave, valor);
    return true;
  } catch {
    return false;
  }
}

/** Guarda la key del proveedor. Devuelve false si no se pudo guardar en ningún sitio. */
export function guardarKey(
  proveedor: string,
  key: string,
  opciones: { recordar?: boolean } = {},
  almacenes: Almacenes = almacenesDelNavegador()
): boolean {
  const clave = nombre(proveedor);
  if (!key) {
    olvidarKey(proveedor, almacenes);
    return true;
  }
  if (opciones.recordar) {
    const ok = escribirEn(almacenes.local, clave, key);
    // Una sola copia: la de sesión se quita para que no tape cambios posteriores.
    if (ok) borrarDe(almacenes.sesion, clave);
    return ok;
  }
  const ok = escribirEn(almacenes.sesion, clave, key);
  // Si antes estaba recordada y ahora no, se quita del disco.
  borrarDe(almacenes.local, clave);
  return ok;
}

/** Si existe en ambos almacenes, sessionStorage gana. */
export function leerKey(
  proveedor: string,
  almacenes: Almacenes = almacenesDelNavegador()
): string {
  const clave = nombre(proveedor);
  return leerDe(almacenes.sesion, clave) ?? leerDe(almacenes.local, clave) ?? "";
}

/** ¿Está la key recordada en este dispositivo (localStorage)? */
export function estaRecordada(
  proveedor: string,
  almacenes: Almacenes = almacenesDelNavegador()
): boolean {
  return leerDe(almacenes.local, nombre(proveedor)) !== null;
}

export function olvidarKey(
  proveedor: string,
  almacenes: Almacenes = almacenesDelNavegador()
): void {
  const clave = nombre(proveedor);
  borrarDe(almacenes.sesion, clave);
  borrarDe(almacenes.local, clave);
}

function clavesConPrefijo(s: Storage | null): string[] {
  if (!s) return [];
  try {
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIJO_KEY)) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}

export function olvidarTodas(almacenes: Almacenes = almacenesDelNavegador()): void {
  for (const s of [almacenes.sesion, almacenes.local]) {
    for (const k of clavesConPrefijo(s)) borrarDe(s, k);
  }
}
