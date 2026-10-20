// Cuentas con Supabase (Auth + Postgres). Todo es opcional: sin estas variables la app sigue
// funcionando sin cuentas (modo gratis, OpenRouter y key propia no las necesitan).
//
//   NEXT_PUBLIC_SUPABASE_URL              https://<proyecto>.supabase.co
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  sb_publishable_… (o la anon key de antes); va al navegador
//   SUPABASE_SECRET_KEY                   sb_secret_… (o la service_role); solo servidor, mueve créditos

export interface ConfigSupabase {
  url: string;
  clavePublica: string;
}

// Next solo reemplaza process.env.NEXT_PUBLIC_* cuando se escriben literales: no desestructurar.
function envPublico(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** URL y key pública, o null si las cuentas no están configuradas. */
export function configSupabase(env: Record<string, string | undefined> = envPublico()): ConfigSupabase | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const clavePublica = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && clavePublica ? { url, clavePublica } : null;
}

/** Key secreta del servidor, o null. Nunca se importa desde un componente de cliente. */
export function claveSecretaSupabase(env: Record<string, string | undefined> = process.env): string | null {
  return env.SUPABASE_SECRET_KEY?.trim() || null;
}

/** Ruta interna a la que volver tras entrar. Solo rutas propias: nada de //otro.com ni URLs absolutas. */
export function rutaSegura(siguiente: string | null | undefined): string {
  if (!siguiente || !siguiente.startsWith("/") || siguiente.startsWith("//") || siguiente.startsWith("/\\")) {
    return "/";
  }
  return siguiente;
}
