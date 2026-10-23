"use client";

import { useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { PAQUETES, textoPrecio } from "@/lib/paquetes";
import { correoValido, textoCreditos, urlVueltaLogin, type EstadoCuenta } from "@/lib/cuenta";

/** Qué muestra el panel además del resumen: el login, los paquetes o nada. La controla ConfigPanel. */
export type VistaCuenta = "nada" | "entrar" | "comprar";

type Envio = "libre" | "enviando" | "enviado";

interface CuentaProps {
  estado: EstadoCuenta | null;
  errorLogin: string | null;
  recargar: () => void;
  vista: VistaCuenta;
  onVista: (v: VistaCuenta) => void;
}

// Panel de cuenta: entrar con Google o con un enlace al correo, ver los créditos, comprar y salir.
// Las cuentas solo hacen falta para los créditos; sin Supabase configurado no se muestra nada.
// El estado lo trae useCuenta (hooks/useCuenta.ts) para que el selector de modo también lo vea.
export default function Cuenta({ estado, errorLogin, recargar, vista, onVista }: CuentaProps) {
  const supabase = clienteNavegador();
  const [envio, setEnvio] = useState<Envio>("libre");
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);

  if (!supabase) return null;
  if (!estado) {
    return (
      <section className="ajustes-cuenta" aria-labelledby="cuenta-titulo" aria-busy="true">
        <h3 id="cuenta-titulo" className="ajustes-seccion">Tu cuenta</h3>
        <p className="config-aviso cuenta-cargando">Mirando tu cuenta…</p>
      </section>
    );
  }
  if (!estado.configurada) return null;
  const mensajeError = error ?? errorLogin;

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
    setEnvio("enviando");
    const { error } = await supabase.auth.signInWithOtp({
      email: correo.trim(),
      options: { emailRedirectTo: urlVueltaLogin(window.location.origin) },
    });
    if (error) {
      setEnvio("libre");
      setError("No pudimos mandar el enlace. Espera un minuto y vuelve a intentarlo.");
    } else {
      setEnvio("enviado");
    }
  };

  const comprar = async (paquete: string) => {
    setError(null);
    setPagando(paquete);
    try {
      const r = await fetch("/api/pagos/preferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paquete }),
      });
      const cuerpo = (await r.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
      if (r.ok && typeof cuerpo?.url === "string") {
        window.location.assign(cuerpo.url);
        return;
      }
      setError(typeof cuerpo?.error === "string" ? cuerpo.error : "No pudimos iniciar el pago. Vuelve a intentarlo.");
    } catch {
      setError("No pudimos iniciar el pago. Revisa tu conexión y vuelve a intentarlo.");
    }
    setPagando(null);
  };

  const salir = async () => {
    await supabase.auth.signOut();
    setEnvio("libre");
    onVista("nada");
    recargar();
  };

  const comprando = vista === "comprar";
  return (
    <section className="ajustes-cuenta" id="ajustes-cuenta" aria-labelledby="cuenta-titulo">
      <h3 id="cuenta-titulo" className="ajustes-seccion">Tu cuenta</h3>
      {estado.usuario ? (
        <div className="cuenta-sesion">
          <p className="cuenta-correo">{estado.usuario.email}</p>
          <p className="cuenta-saldo">
            <strong>{textoCreditos(estado.usuario.creditos)}</strong>
          </p>
          <div className="cuenta-acciones">
            <button
              type="button"
              className="config-modo cuenta-boton"
              onClick={() => onVista(comprando ? "nada" : "comprar")}
              aria-expanded={comprando}
            >
              <span className="config-modo-titulo">Comprar créditos</span>
            </button>
            <button type="button" className="cuenta-salir" onClick={salir}>
              Salir
            </button>
          </div>
        </div>
      ) : envio === "enviado" ? (
        <p className="config-aviso" role="status">
          Te mandamos un enlace a {correo.trim()}. Ábrelo en este mismo navegador para entrar.
        </p>
      ) : vista !== "entrar" ? (
        <div className="cuenta-sesion">
          <p className="cuenta-invita">Entra para jugar con créditos: modelos mejores, personalidades y fotos.</p>
          <button type="button" className="config-modo cuenta-boton" onClick={() => onVista("entrar")}>
            <span className="config-modo-titulo">Entrar</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          <button type="button" id="cuenta-google" className="config-modo cuenta-boton" onClick={entrarConGoogle}>
            <span className="config-modo-titulo">Entrar con Google</span>
          </button>
          <label className="config-etiqueta" htmlFor="cuenta-correo">
            O te mandamos un enlace al correo
          </label>
          <div className="cuenta-correo-fila">
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
            <button type="button" className="config-modo cuenta-boton" onClick={pedirEnlace} disabled={envio === "enviando"}>
              <span className="config-modo-titulo">{envio === "enviando" ? "Enviando…" : "Mandar enlace"}</span>
            </button>
          </div>
        </div>
      )}
      {estado.usuario && comprando && (
        <ul className="cuenta-paquetes" aria-label="Paquetes de créditos">
          {PAQUETES.map((p) => (
            <li key={p.id}>
              <button type="button" className="config-modo cuenta-paquete" disabled={pagando !== null} onClick={() => comprar(p.id)}>
                <span className="config-modo-titulo">
                  {pagando === p.id ? "Abriendo el pago…" : `${p.nombre}: ${textoCreditos(p.creditos)}`}
                </span>
                <span className="config-modo-detalle">{textoPrecio(p.precioCop)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {mensajeError && (
        <p className="caja-error" role="alert">
          {mensajeError}
        </p>
      )}
    </section>
  );
}
