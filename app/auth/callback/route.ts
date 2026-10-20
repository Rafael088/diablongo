import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { rutaSegura } from "@/lib/supabase/config";

// Vuelta del login (Google o enlace al correo): Supabase manda ?code=… y aquí se cambia por la
// sesión (cookies). Si algo falla se vuelve al inicio con ?cuenta=error para avisar.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destino = rutaSegura(url.searchParams.get("next"));

  const supabase = await clienteServidor();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destino, url.origin));
    console.error("No se pudo abrir la sesión:", error.message);
  }
  return NextResponse.redirect(new URL("/?cuenta=error", url.origin));
}
