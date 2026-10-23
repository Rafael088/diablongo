"use client";

import { useState } from "react";
import type { DebateRole } from "@/types";
import {
  AVISO_COMPARTIR_FALLO,
  AVISO_LINK_COPIADO,
  compartirReto,
  crearRetoCliente,
  entornoNavegador,
} from "@/lib/compartirReto";

/** «Reta a tus amigos»: crea el reto del debate (con créditos) y abre compartir. */
export default function BotonReto({ debate, eleccion }: { debate: string; eleccion: DebateRole }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const pulsar = async () => {
    setTrabajando(true);
    setError(null);
    setAviso(null);
    // Aquí se crea el reto en el cliente (POST /api/retos).
    const r = await crearRetoCliente(debate, eleccion);
    if (!r.ok) {
      setError(r.error);
    } else {
      const res = await compartirReto(r.ruta, entornoNavegador());
      if (res === "copiado") setAviso(AVISO_LINK_COPIADO);
      else if (res === "fallo") setError(AVISO_COMPARTIR_FALLO);
    }
    setTrabajando(false);
  };

  return (
    <div className="boton-reto">
      <button type="button" className="caja-boton" onClick={pulsar} disabled={trabajando}>
        {trabajando ? "Creando el reto…" : "Reta a tus amigos"}
      </button>
      {aviso && <p role="status">{aviso}</p>}
      {error && <p className="caja-error" role="alert">{error}</p>}
    </div>
  );
}
