"use client";

import { useEffect, useState } from "react";
import { compartirReto, entornoNavegador, AVISO_COMPARTIR_FALLO, AVISO_LINK_COPIADO } from "@/lib/compartirReto";
import { nombreVisible } from "@/lib/personalidades";
import type { ResumenReto } from "@/lib/retos";

type Estado = { tipo: "cargando" } | { tipo: "oculto" } | { tipo: "error" } | { tipo: "lista"; retos: ResumenReto[] };

/** Lista «Mis retos» de Ajustes. Sin sesión (401) o sin Supabase no se muestra nada. */
export default function MisRetos() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/retos", { cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        if (r.status === 401 || r.status === 503) return setEstado({ tipo: "oculto" });
        const cuerpo = await r.json();
        setEstado(r.ok && Array.isArray(cuerpo?.retos) ? { tipo: "lista", retos: cuerpo.retos } : { tipo: "error" });
      })
      .catch(() => {
        if (!ac.signal.aborted) setEstado({ tipo: "error" });
      });
    return () => ac.abort();
  }, []);

  if (estado.tipo === "cargando" || estado.tipo === "oculto") return null;

  const compartir = async (id: string) => {
    setAviso(null);
    const r = await compartirReto(`/r/${id}`, entornoNavegador());
    if (r === "copiado") setAviso(AVISO_LINK_COPIADO);
    else if (r === "fallo") setAviso(AVISO_COMPARTIR_FALLO);
  };

  return (
    <section className="ajustes-cuenta" aria-labelledby="retos-titulo">
      <h3 id="retos-titulo" className="ajustes-seccion">Mis retos</h3>
      {estado.tipo === "error" ? (
        <p className="caja-error" role="alert">No pudimos cargar tus retos.</p>
      ) : estado.retos.length === 0 ? (
        <p className="config-aviso">
          Todavía no has retado a nadie. Al terminar un debate con créditos, toca «Reta a tus amigos».
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {estado.retos.map((r) => (
            <li key={r.id} className="config-aviso flex flex-col gap-1">
              <strong>{r.tema}</strong>
              <span>
                {nombreVisible("pro", r.personalidades.pro)} {r.votos.pro} – {r.votos.con} {nombreVisible("con", r.personalidades.con)}
              </span>
              <span>Tú elegiste a {nombreVisible(r.eleccion, r.personalidades[r.eleccion])}</span>
              <span className="flex gap-4">
                <a className="underline" href={`/r/${r.id}`}>Ver reto</a>
                <button type="button" className="underline" onClick={() => compartir(r.id)}>Compartir</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p role="status">{aviso}</p>}
    </section>
  );
}
