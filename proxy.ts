import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { configSupabase } from "@/lib/supabase/config";

// Refresca la sesión de Supabase en cada visita (el token dura poco y los Server Components no
// pueden reescribir cookies). Sin cuentas configuradas no hace nada.
export async function proxy(request: NextRequest) {
  const config = configSupabase();
  if (!config) return NextResponse.next();

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.clavePublica, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista, cabeceras) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
        // Una respuesta que pone cookies de sesión no debe quedar en ninguna caché compartida.
        for (const [clave, valor] of Object.entries(cabeceras ?? {})) respuesta.headers.set(clave, valor);
      },
    },
  });

  // getUser() valida el token contra Supabase y, si venció, lo renueva (setAll de arriba).
  await supabase.auth.getUser();
  return respuesta;
}

export const config = {
  // Ni estáticos ni imágenes ni la API del debate (esa no usa la sesión de cuenta todavía).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sprites/|api/debate|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
