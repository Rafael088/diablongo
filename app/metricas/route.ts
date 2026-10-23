import { NextRequest, NextResponse, connection } from "next/server";
import { obtenerAlmacen } from "@/lib/almacen";
import { revisarAcceso } from "@/lib/accesoMetricas";
import { COLUMNAS, leerMetricas, type ClaveMetrica } from "@/lib/metricas";

/**
 * GET /metricas: tabla privada de los últimos 30 días. Basic Auth con METRICAS_CLAVE (ver
 * lib/accesoMetricas.ts); sin la variable responde 404. Es una ruta (no una página) para poder
 * contestar 401/404 de verdad, y se evalúa en cada visita: nunca se prerenderiza.
 */
const ROTULOS: Record<ClaveMetrica, string> = {
  limite_gratis: "Rechazos por límite gratis",
  limite_gratis_personas: "Personas que llegaron al límite",
  debate_creditos: "Debates con créditos",
  reto_creado: "Retos creados",
  reto_abierto: "Retos abiertos",
  reto_votado: "Retos votados",
};

const CABECERAS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();
  const acceso = revisarAcceso(request.headers.get("authorization"));
  if (acceso === "no-configurado") return new NextResponse("Not found", { status: 404, headers: CABECERAS });
  if (acceso === "pedir-clave") {
    return new NextResponse("Hace falta la clave.", {
      status: 401,
      headers: { ...CABECERAS, "WWW-Authenticate": 'Basic realm="Metricas", charset="UTF-8"' },
    });
  }
  const almacen = obtenerAlmacen();
  const filas = almacen ? await leerMetricas(almacen, 30) : [];
  const total = (c: ClaveMetrica) => filas.reduce((s, f) => s + f.valores[c], 0);
  const cuerpo = almacen
    ? `<table><thead><tr><th>Día</th>${COLUMNAS.map((c) => `<th>${esc(ROTULOS[c])}</th>`).join("")}</tr></thead><tbody>${filas
        .map((f) => `<tr><td>${f.dia}</td>${COLUMNAS.map((c) => `<td>${f.valores[c]}</td>`).join("")}</tr>`)
        .join("")}</tbody><tfoot><tr><th>Total 30 días</th>${COLUMNAS.map((c) => `<th>${total(c)}</th>`).join("")}</tr></tfoot></table>
<p>«Personas» es un conteo aproximado de IPs distintas por día; la IP no se guarda.</p>`
    : "<p>No hay almacén (Upstash) configurado.</p>";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Métricas · Diablongo</title><style>body{font:15px system-ui;margin:1rem;max-width:1000px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #8884;padding:.35rem .6rem;text-align:right}th:first-child,td:first-child{text-align:left}thead th{background:#8882}div{overflow-x:auto}</style></head><body><h1>Métricas de Diablongo</h1><p>Últimos 30 días (hora de Colombia), sin datos personales.</p><div>${cuerpo}</div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { ...CABECERAS, "Content-Type": "text/html; charset=utf-8" } });
}
