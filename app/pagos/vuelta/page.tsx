import { Suspense } from "react";
import Link from "next/link";
import { interpretarVuelta } from "@/lib/pagos";

// Página a la que Mercado Pago devuelve a la persona. Solo INFORMA.
// IMPORTANTE: esta página NO acredita créditos. Los query params los puede escribir cualquiera;
// los créditos los suma únicamente el webhook (/api/pagos/webhook), que confirma el pago con Mercado Pago.
export const metadata = { title: "Tu pago · Diablongo" };

type Parametros = Promise<Record<string, string | string[] | undefined>>;

// Con Cache Components, leer searchParams fuera de <Suspense> bloquea el prerender (y el build de Vercel):
// el marco de la página se prerenderiza y el resultado del pago se rellena en cada visita.
export default function Vuelta({ searchParams }: { searchParams: Parametros }) {
  return (
    <main className="min-h-screen py-8 px-4 flex items-center justify-center">
      <section className="config-aviso max-w-md w-full flex flex-col gap-4 text-center" aria-live="polite">
        <Suspense fallback={<p>Revisando tu pago…</p>}>
          <Resultado searchParams={searchParams} />
        </Suspense>
        <Link href="/" className="config-modo">
          <span className="config-modo-titulo">Volver al juego</span>
        </Link>
      </section>
    </main>
  );
}

async function Resultado({ searchParams }: { searchParams: Parametros }) {
  const r = interpretarVuelta(await searchParams);
  return (
    <>
      <h1 className="text-xl font-bold">{r.titulo}</h1>
      <p>{r.detalle}</p>
      {r.pagoId && <p className="text-sm opacity-70">Referencia del pago: {r.pagoId}</p>}
    </>
  );
}
