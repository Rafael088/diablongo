"use client";

import { useCallback, useEffect, useState } from "react";
import { estadoDeCuenta, type EstadoCuenta } from "@/lib/cuenta";
import { configSupabase } from "@/lib/supabase/config";

const HAY_CUENTAS = configSupabase() !== null;

/**
 * Estado de la cuenta (GET /api/cuenta) para toda la pantalla de inicio: el panel de cuenta, el selector
 * de modo (sin sesión, «Con créditos» no se puede elegir) y el botón de iniciar. `null` mientras carga.
 * Sin Supabase configurado devuelve { configurada: false } sin pedir nada.
 */
export function useCuenta() {
  const [estado, setEstado] = useState<EstadoCuenta | null>(HAY_CUENTAS ? null : { configurada: false });
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!HAY_CUENTAS) return;
    const ac = new AbortController();
    fetch("/api/cuenta", { cache: "no-store", signal: ac.signal })
      .then((r) => r.json())
      .then((cuerpo) => {
        setEstado(estadoDeCuenta(cuerpo));
        if (new URLSearchParams(window.location.search).get("cuenta") === "error") {
          setErrorLogin("No pudimos abrir tu sesión. El enlace puede haber vencido: vuelve a intentarlo.");
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setEstado({ configurada: true, usuario: null });
      });
    return () => ac.abort();
  }, [recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  return { estado, errorLogin, recargar };
}

/** Créditos de la sesión: número si hay sesión, null sin sesión, undefined mientras carga. */
export function creditosDe(estado: EstadoCuenta | null): number | null | undefined {
  if (!estado) return undefined;
  if (!estado.configurada || !estado.usuario) return null;
  return estado.usuario.creditos;
}
