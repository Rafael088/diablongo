import { NextResponse, connection } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { EstadoCuenta } from "@/lib/cuenta";

// Quién está conectado y cuántos créditos tiene. El saldo se lee con la sesión de la persona: la
// política RLS de public.saldos solo le deja ver el suyo.
export async function GET(): Promise<NextResponse<EstadoCuenta>> {
  // Siempre en cada visita: con Cache Components, sin esto se prerenderiza en el build (y sin Supabase
  // quedaría congelada en «sin cuentas»).
  await connection();
  const supabase = await clienteServidor();
  if (!supabase) return NextResponse.json({ configurada: false });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ configurada: true, usuario: null });

  const { data: fila } = await supabase
    .from("saldos")
    .select("creditos")
    .eq("usuario_id", data.user.id)
    .maybeSingle();

  return NextResponse.json(
    {
      configurada: true,
      usuario: { email: data.user.email ?? "", creditos: typeof fila?.creditos === "number" ? fila.creditos : 0 },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
