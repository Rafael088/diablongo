"use client";

import { useEffect, useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { correoValido, estadoDeCuenta, textoCreditos, urlVueltaLogin, type EstadoCuenta } from "@/lib/cuenta";

type Paso = "cerrado" | "abierto" | "enviando" | "enviado";

// Panel de cuenta: entrar con Google o con un enlace al correo, ver los créditos y salir.
// Las cuentas solo hacen falta para los créditos; sin Supabase configurado no se muestra nada.
export default function Cuenta() {
  const supabase = clienteNavegador();
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [paso, setPaso] = useState<Paso>("cerrado");
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const ac = new AbortController();
    fetch("/api/cuenta", { cache: "no-store", signal: ac.signal })
      .then((r) => r.json())
      .then((cuerpo) => {
        setEstado(estadoDeCuenta(cuerpo));
        if (new URLSearchParams(window.location.search).get("cuenta") === "error") {
          setError("No pudimos abrir tu sesión. El enlace puede haber vencido: vuelve a intentarlo.");
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setEstado({ configurada: true, usuario: null });
      });
    return () => ac.abort();
  }, [supabase, recarga]);

  if (!supabase || !estado || !estado.configurada) return null;

  const entrarConGoogle = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: urlVueltaLogin(window.location.origin) },
    });
    if (error) setError("No pudimos abrir Google. Vuelve a intentarlo.");
  };

  const pedirEnlace = async () => {
    if (!correoValido(correo)) {
      setError("Escribe un correo válido.");
      return;
    }
    setError(null);
    setPaso("enviando");
    const { error } = await supabase.auth.signInWithOtp({
      email: correo.trim(),
      options: { emailRedirectTo: urlVueltaLogin(window.location.origin) },
    });
    if (error) {
      setPaso("abierto");
      setError("No pudimos mandar el enlace. Espera un minuto y vuelve a intentarlo.");
    } else {
      setPaso("enviado");
    }
  };

  const salir = async () => {
    await supabase.auth.signOut();
    setPaso("cerrado");
    setRecarga((n) => n + 1);
  };

  return (
    <section className="w-full max-w-4xl mx-auto px-6 mb-4" aria-label="Tu cuenta">
      <div className="config-aviso flex flex-wrap items-center justify-between gap-3">
        {estado.usuario ? (
          <>
            <span>
              {estado.usuario.email} · <strong>{textoCreditos(estado.usuario.creditos)}</strong>
            </span>
            <button type="button" className="underline" onClick={salir}>
              Salir
            </button>
          </>
        ) : paso === "cerrado" ? (
          <>
            <span>Entra para comprar créditos y usar los modelos buenos.</span>
            <button type="button" className="underline" onClick={() => setPaso("abierto")}>
              Entrar
            </button>
          </>
        ) : paso === "enviado" ? (
          <span role="status">
            Te mandamos un enlace a {correo.trim()}. Ábrelo en este mismo navegador para entrar.
          </span>
        ) : (
          <div className="flex flex-col gap-3 w-full">
            <button type="button" className="config-modo" onClick={entrarConGoogle}>
              <span className="config-modo-titulo">Entrar con Google</span>
            </button>
            <label className="config-etiqueta" htmlFor="cuenta-correo">
              O te mandamos un enlace al correo
            </label>
            <div className="flex gap-2">
              <input
                id="cuenta-correo"
                type="email"
                autoComplete="email"
                className="config-campo"
                placeholder="tu@correo.com"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && pedirEnlace()}
              />
              <button type="button" className="config-modo" onClick={pedirEnlace} disabled={paso === "enviando"}>
                <span className="config-modo-titulo">{paso === "enviando" ? "Enviando…" : "Mandar enlace"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p className="caja-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
