// Estado de la cuenta que ve la persona (GET /api/cuenta) y textos del panel. Lógica pura.

export type EstadoCuenta =
  | { configurada: false }
  | { configurada: true; usuario: null }
  | { configurada: true; usuario: { email: string; creditos: number } };

/** Interpreta la respuesta de /api/cuenta. Cualquier rareza cuenta como «sin sesión». */
export function estadoDeCuenta(cuerpo: unknown): EstadoCuenta {
  if (!cuerpo || typeof cuerpo !== "object") return { configurada: true, usuario: null };
  const c = cuerpo as { configurada?: unknown; usuario?: unknown };
  if (c.configurada === false) return { configurada: false };
  const u = c.usuario as { email?: unknown; creditos?: unknown } | null | undefined;
  if (!u || typeof u !== "object" || typeof u.email !== "string") return { configurada: true, usuario: null };
  const creditos = typeof u.creditos === "number" && Number.isFinite(u.creditos) ? Math.max(0, Math.floor(u.creditos)) : 0;
  return { configurada: true, usuario: { email: u.email, creditos } };
}

export function textoCreditos(creditos: number): string {
  return creditos === 1 ? "1 crédito" : `${creditos} créditos`;
}

/** Validación ligera antes de pedir el enlace (la de verdad la hace Supabase). */
export function correoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());
}

/** Adónde vuelve Supabase después de Google o del enlace del correo. */
export function urlVueltaLogin(origen: string): string {
  return `${origen}/auth/callback`;
}
