"use client";

import { useEffect, useRef, useState } from "react";
import { ACCION_TURNSTILE } from "@/lib/turnstile";

const URL_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TIEMPO_MAX_SCRIPT_MS = 15000;

interface OpcionesTurnstile {
  sitekey: string;
  action: string;
  theme: "dark";
  size: "flexible";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

interface TurnstileGlobal {
  render: (contenedor: HTMLElement, opciones: OpcionesTurnstile) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

let promesaScript: Promise<TurnstileGlobal> | null = null;

/** Carga api.js una sola vez (render explícito). Si falla, la próxima llamada vuelve a intentarlo. */
function cargarScript(): Promise<TurnstileGlobal> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (promesaScript) return promesaScript;
  promesaScript = new Promise<TurnstileGlobal>((resolver, rechazar) => {
    const script = document.createElement("script");
    script.src = URL_SCRIPT;
    script.async = true;
    const reloj = setTimeout(() => fallar(), TIEMPO_MAX_SCRIPT_MS);
    function fallar() {
      clearTimeout(reloj);
      script.remove();
      promesaScript = null;
      rechazar(new Error("turnstile no cargó"));
    }
    script.onload = () => {
      clearTimeout(reloj);
      if (window.turnstile) resolver(window.turnstile);
      else fallar();
    };
    script.onerror = fallar;
    document.head.appendChild(script);
  });
  return promesaScript;
}

interface TurnstileWidgetProps {
  sitekey: string;
  /** Token nuevo, o null cuando caduca o falla (de un solo uso: el padre lo descarta al usarlo). */
  onToken: (token: string | null) => void;
}

/** Widget de Cloudflare Turnstile (tema oscuro, tamaño flexible, acción «iniciar-debate»). */
export default function TurnstileWidget({ sitekey, onToken }: TurnstileWidgetProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "fallo">("cargando");
  const [intento, setIntento] = useState(0);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    let cancelado = false;
    let id: string | null = null;
    let api: TurnstileGlobal | null = null;
    cargarScript().then(
      (turnstile) => {
        if (cancelado || !contenedor.current) return;
        api = turnstile;
        id = turnstile.render(contenedor.current, {
          sitekey,
          action: ACCION_TURNSTILE,
          theme: "dark",
          size: "flexible",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
        setEstado("listo");
      },
      () => {
        if (!cancelado) setEstado("fallo");
      }
    );
    return () => {
      cancelado = true;
      if (id && api) api.remove(id);
    };
  }, [sitekey, intento]);

  const reintentar = () => {
    setEstado("cargando");
    setIntento((n) => n + 1);
  };

  return (
    <div>
      <p id="turnstile-ayuda" className="text-sm opacity-70 mb-2">
        Comprobación de seguridad de Cloudflare: confirma que eres una persona antes de empezar.
      </p>
      <div
        ref={contenedor}
        role="group"
        aria-label="Comprobación de seguridad de Cloudflare Turnstile"
        aria-describedby="turnstile-ayuda"
        className="min-h-[65px]"
      />
      {estado === "cargando" && (
        <p className="text-sm opacity-70" role="status">
          Cargando la comprobación de seguridad…
        </p>
      )}
      {estado === "fallo" && (
        <div role="alert" className="text-sm mt-2">
          <p>
            No se pudo cargar la comprobación de seguridad. Puede que un bloqueador de anuncios o de
            rastreadores la esté bloqueando: desactívalo para esta página.
          </p>
          <button type="button" onClick={reintentar} className="config-campo mt-2" style={{ width: "auto" }}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
