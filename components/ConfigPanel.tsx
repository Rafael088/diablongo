"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { proveedoresDisponibles, getProviderById } from "@/lib/providers";
import { DebateConfig, DebaterConfig, ProviderConfig } from "@/types";
import { getConfig, saveConfig, SavedConfig } from "@/lib/storage";
import { Swords, Settings2, Eye, EyeOff } from "lucide-react";
import { iniciarConexion, procesarVuelta, PROVEEDOR_OAUTH } from "@/lib/oauthOpenRouter";
import { AVISO_RECORDAR, estaRecordada, guardarKey, leerKey, olvidarKey } from "@/lib/keys";
import { MAX_TEMA } from "@/lib/topes";
import {
  EstadoContador,
  ModoConfig,
  OPENROUTER_DISPONIBLE,
  modoDelServidor,
  modoInicial,
  pedirCupo,
  proveedorDelModo,
  puedeIniciar,
  textoContador,
} from "@/lib/modoConfig";
import TurnstileWidget from "./TurnstileWidget";
import { configSupabase } from "@/lib/supabase/config";
import { CREDITOS_POR_DEBATE } from "@/lib/creditosDebate";
import { textoCreditos } from "@/lib/cuenta";

// «Con créditos» solo existe si hay cuentas (Supabase configurado).
const HAY_CUENTAS = configSupabase() !== null;

interface ConfigPanelProps {
  /** `turnstile` es el token de Cloudflare (de un solo uso); falta solo en desarrollo sin sitekey. */
  onStart: (config: DebateConfig, turnstile?: string) => void;
}

const SITEKEY_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
// Sin sitekey solo se puede empezar en desarrollo (el servidor también omite la verificación ahí).
const OMITIR_TURNSTILE = !SITEKEY_TURNSTILE && process.env.NODE_ENV === "development";

// Solo se llama al montar en el navegador (el formulario se monta tras hidratar).
function vieneDeOpenRouter(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code");
}

const subscribeVacio = () => () => {};

// Las preferencias guardadas viven en localStorage: solo existen en el navegador.
// En el servidor se pinta con valores por defecto y, al hidratar, se vuelve a montar
// el formulario con lo guardado (sin setState dentro de efectos).
export default function ConfigPanel({ onStart }: ConfigPanelProps) {
  const enNavegador = useSyncExternalStore(
    subscribeVacio,
    () => true,
    () => false
  );
  return (
    <ConfigForm
      key={enNavegador ? "navegador" : "servidor"}
      saved={enNavegador ? getConfig() : null}
      onStart={onStart}
    />
  );
}

// Si el modelo elegido no pertenece al proveedor, se usa el primero del proveedor.
function modeloValido(providerId: string, model: string): string {
  const p = getProviderById(providerId);
  return p && !p.models.includes(model) ? p.models[0] : model;
}

// Un proveedor guardado que ya no está disponible (p. ej. ollama en producción), o el modo gratis,
// cae al primero: el selector de proveedor solo existe en el modo «Mi key».
function proveedorValido(id: string | undefined, disponibles: ProviderConfig[]): string {
  return disponibles.find((p) => p.id === id)?.id ?? disponibles[0].id;
}

function ConfigForm({ saved, onStart }: ConfigPanelProps & { saved: SavedConfig | null }) {
  const disponibles = proveedoresDisponibles();
  const porDefecto = disponibles[0];
  const hayKeys = disponibles.some((p) => leerKey(p.id) !== "");
  const [modo, setModo] = useState<ModoConfig>(() => (vieneDeOpenRouter() ? "openrouter" : modoInicial(saved, hayKeys, HAY_CUENTAS)));
  const [topic, setTopic] = useState((saved?.topic ?? "").slice(0, MAX_TEMA));

  const [proProvider, setProProvider] = useState(proveedorValido(saved?.proProvider, disponibles));
  const [proModelRaw, setProModel] = useState(saved?.proModel ?? porDefecto.models[0]);

  const [conProvider, setConProvider] = useState(proveedorValido(saved?.conProvider, disponibles));
  const [conModelRaw, setConModel] = useState(saved?.conModel ?? porDefecto.models[1]);

  // Una key por proveedor (si Ángel y Diablo usan el mismo, comparten key).
  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(disponibles.map((p) => [p.id, leerKey(p.id)]))
  );
  const [recordar, setRecordar] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(disponibles.map((p) => [p.id, estaRecordada(p.id)]))
  );
  // En «Conectar OpenRouter» no se elige proveedor: siempre OpenRouter, con la key del OAuth.
  const enOpenRouter = modo === "openrouter";
  const proProv0 = enOpenRouter ? PROVEEDOR_OAUTH : proProvider;
  const conProv0 = enOpenRouter ? PROVEEDOR_OAUTH : conProvider;
  const proApiKey = keys[proProv0] ?? "";
  const conApiKey = keys[conProv0] ?? "";
  const conectado = (keys[PROVEEDOR_OAUTH] ?? "") !== "";
  const cambiarKey = (id: string, valor: string) => setKeys((k) => ({ ...k, [id]: valor }));
  const cambiarRecordar = (id: string, valor: boolean) => {
    setRecordar((r) => ({ ...r, [id]: valor }));
    // Si ya hay una key escrita, el cambio de almacén se aplica al momento.
    if (keys[id]) guardarKey(id, keys[id], { recordar: valor });
  };
  const desconectar = (id: string) => {
    olvidarKey(id);
    setKeys((k) => ({ ...k, [id]: "" }));
    setRecordar((r) => ({ ...r, [id]: false }));
  };

  // Vuelta de OpenRouter: ?code=... se canjea una sola vez y la key queda como cualquier otra (sesión).
  const [conexion, setConexion] = useState<{ estado: "libre" | "trabajando" | "error"; mensaje?: string }>(() => ({
    estado: vieneDeOpenRouter() ? "trabajando" : "libre",
  }));
  useEffect(() => {
    const canje = procesarVuelta(
      window.location,
      window.sessionStorage,
      (nueva) => window.history.replaceState(null, "", nueva)
    );
    if (!canje) return;
    let vivo = true;
    canje.then((r) => {
      if (!vivo) return;
      if (r.ok) {
        guardarKey(PROVEEDOR_OAUTH, r.key, { recordar: false });
        setKeys((k) => ({ ...k, [PROVEEDOR_OAUTH]: r.key }));
        setRecordar((x) => ({ ...x, [PROVEEDOR_OAUTH]: false }));
        setConexion({ estado: "libre" });
      } else {
        setConexion({ estado: "error", mensaje: r.error });
      }
    });
    return () => {
      vivo = false;
    };
  }, []);
  const conectar = async () => {
    setConexion({ estado: "trabajando" });
    try {
      window.location.assign(await iniciarConexion(window.location, window.sessionStorage));
    } catch {
      setConexion({ estado: "error", mensaje: "No pudimos empezar la conexión con OpenRouter en este navegador." });
    }
  };

  const [tokenTurnstile, setTokenTurnstile] = useState<string | null>(null);
  const verificado = OMITIR_TURNSTILE || tokenTurnstile !== null;

  // Contador de debates gratis de hoy: solo se pide en el modo Gratis y nunca rompe la pantalla.
  const [contadorPedido, setContadorPedido] = useState<EstadoContador | null>(null);
  useEffect(() => {
    if (modo !== "gratis") return;
    const ac = new AbortController();
    pedirCupo(fetch, ac.signal).then((e) => {
      if (!ac.signal.aborted) setContadorPedido(e);
    });
    return () => ac.abort();
  }, [modo]);
  const contador: EstadoContador = contadorPedido ?? { tipo: "cargando" };
  const puedeEmpezar = puedeIniciar({ modo, tema: topic, verificado, contador, conectadoOpenRouter: conectado });

  const proModel = modeloValido(proProv0, proModelRaw);
  const conModel = modeloValido(conProv0, conModelRaw);

  const handleStart = () => {
    if (!puedeEmpezar) return;
    const proProv = proveedorDelModo(modo, proProvider);
    const conProv = proveedorDelModo(modo, conProvider);
    const idsKey = enOpenRouter ? [PROVEEDOR_OAUTH] : [proProvider, conProvider];
    const gratis = modoDelServidor(modo);

    saveConfig({
      topic,
      modo,
      proProvider,
      proModel,
      conProvider,
      conModel,
    });
    for (const id of gratis ? [] : new Set(idsKey)) {
      if (getProviderById(id)?.requiresApiKey) {
        guardarKey(id, keys[id] ?? "", { recordar: recordar[id] ?? false });
      }
    }

    const pro: DebaterConfig = {
      role: "pro",
      provider: proProv,
      model: gratis ? "" : proModel,
      apiKey: gratis ? "" : proApiKey,
      name: "PRO",
    };

    const con: DebaterConfig = {
      role: "con",
      provider: conProv,
      model: gratis ? "" : conModel,
      apiKey: gratis ? "" : conApiKey,
      name: "CON",
    };

    onStart({ topic: topic.trim(), pro, con }, tokenTurnstile ?? undefined);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto p-6"
    >
      <div className="config-caja">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3" style={{ border: "2px solid var(--color-diablo)" }}>
            <Swords className="w-8 h-8" style={{ color: "var(--color-diablo)" }} />
          </div>
          <div>
            <h1 className="config-titulo">Agent Debate</h1>
            <p className="config-sub">Pon a dos IAs a debatir cualquier tema</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="config-etiqueta">
              Tema o propuesta a debatir
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="¿Deberíamos migrar nuestra base de datos a PostgreSQL?"
              maxLength={MAX_TEMA}
              className="config-campo h-24 resize-none"
            />
            <p className="text-xs opacity-60 text-right mt-1" aria-live="off">
              {topic.length}/{MAX_TEMA}
            </p>
          </div>

          <SelectorModo modo={modo} onChange={setModo} />

          {modo === "gratis" && <ContadorGratis estado={contador} />}

          {modo === "creditos" && (
            <p className="config-aviso" role="status">
              Ángel y Diablo juegan con modelos de pago. Cada debate cuesta {textoCreditos(CREDITOS_POR_DEBATE)} de
              tu cuenta; si los modelos fallan antes de terminar, te lo devolvemos. Entra a tu cuenta arriba.
            </p>
          )}

          {modo === "openrouter" && (
            <ConexionOpenRouter
              conectado={conectado}
              estado={conexion.estado}
              mensaje={conexion.mensaje}
              onConectar={conectar}
              onDesconectar={() => desconectar(PROVEEDOR_OAUTH)}
            />
          )}

          {(modo === "key" || (modo === "openrouter" && conectado)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DebaterForm
              title="Defensor (PRO)"
              color="pro"
              provider={proProv0}
              soloModelo={enOpenRouter}
              model={proModel}
              apiKey={proApiKey}
              recordar={recordar[proProv0] ?? false}
              onProviderChange={setProProvider}
              onModelChange={setProModel}
              onApiKeyChange={(v) => cambiarKey(proProv0, v)}
              onRecordarChange={(v) => cambiarRecordar(proProv0, v)}
              onDesconectar={() => desconectar(proProv0)}
            />
            <DebaterForm
              title="Opositor (CON)"
              color="con"
              provider={conProv0}
              soloModelo={enOpenRouter}
              model={conModel}
              apiKey={conApiKey}
              recordar={recordar[conProv0] ?? false}
              onProviderChange={setConProvider}
              onModelChange={setConModel}
              onApiKeyChange={(v) => cambiarKey(conProv0, v)}
              onRecordarChange={(v) => cambiarRecordar(conProv0, v)}
              onDesconectar={() => desconectar(conProv0)}
            />
          </div>
          )}

          {SITEKEY_TURNSTILE ? (
            <TurnstileWidget sitekey={SITEKEY_TURNSTILE} onToken={setTokenTurnstile} />
          ) : (
            !OMITIR_TURNSTILE && (
              <p role="alert" className="text-sm">
                El servidor no está bien configurado: falta la comprobación de seguridad.
              </p>
            )
          )}

          <button
            onClick={handleStart}
            disabled={!puedeEmpezar}
            className="config-iniciar"
          >
            Iniciar Debate
          </button>

          <p className="config-nota">
            {modo === "openrouter"
              ? "La key que te da OpenRouter se guarda solo en esta pestaña y se borra al cerrarla. Nunca se envía a ningún servidor propio."
              : modo === "creditos"
              ? "No necesitas key: el servidor pone los modelos y descuenta los créditos al empezar."
              : modo === "key"
              ? "Tu API key se guarda solo en esta pestaña y se borra al cerrarla, salvo que marques «Recordar en este dispositivo». Nunca se envía a ningún servidor propio."
              : "Sin key no guardamos nada tuyo: el servidor pone el modelo y el límite es por día."}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

interface DebaterFormProps {
  title: string;
  color: "pro" | "con";
  provider: string;
  /** En «Conectar OpenRouter» el proveedor y la key ya están resueltos: solo se elige el modelo. */
  soloModelo?: boolean;
  model: string;
  apiKey: string;
  recordar: boolean;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onRecordarChange: (recordar: boolean) => void;
  onDesconectar: () => void;
}

function DebaterForm({
  title,
  color,
  provider,
  soloModelo,
  model,
  apiKey,
  recordar,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  onRecordarChange,
  onDesconectar,
}: DebaterFormProps) {
  const providerConfig = getProviderById(provider);
  const [verKey, setVerKey] = useState(false);

  return (
    <div className={`config-seccion config-seccion-${color}`}>
      <div className="flex items-center gap-2">
        <Settings2 className="w-5 h-5" />
        <h3 className="config-seccion-titulo">{title}</h3>
      </div>

      {!soloModelo && (
      <div>
        <label className="config-etiqueta">Proveedor</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className="config-campo"
        >
          {proveedoresDisponibles().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      )}

      <div>
        <label className="config-etiqueta">Modelo</label>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="config-campo"
        >
          {providerConfig?.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {!soloModelo && providerConfig?.requiresApiKey && (
        <div>
          <label className="config-etiqueta">API Key</label>
          <div className="flex gap-2">
            <input
              type={verKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={`Tu key de ${providerConfig.name}`}
              autoComplete="off"
              spellCheck={false}
              className="config-campo"
            />
            <button
              type="button"
              onClick={() => setVerKey((v) => !v)}
              aria-label={verKey ? "Ocultar la key" : "Mostrar la key"}
              aria-pressed={verKey}
              className="config-campo"
              style={{ width: "auto", flexShrink: 0 }}
            >
              {verKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => onRecordarChange(e.target.checked)}
            />
            Recordar en este dispositivo
          </label>
          <p className="text-xs opacity-70 mt-1">{AVISO_RECORDAR}</p>
          <button
            type="button"
            onClick={onDesconectar}
            className="text-xs underline opacity-70 mt-2"
          >
            Desconectar
          </button>
        </div>
      )}
    </div>
  );
}

const OPCIONES_MODO: { id: ModoConfig; titulo: string; detalle: string }[] = [
  { id: "gratis", titulo: "Gratis", detalle: "Sin key, con un límite por día" },
  { id: "openrouter", titulo: "Conectar OpenRouter", detalle: OPENROUTER_DISPONIBLE ? "Con tu cuenta, sin copiar keys" : "Próximamente" },
  { id: "key", titulo: "Mi key", detalle: "Usa tu propia API key" },
  { id: "creditos", titulo: "Con créditos", detalle: `Modelos buenos, ${textoCreditos(CREDITOS_POR_DEBATE)} por debate` },
];

function SelectorModo({ modo, onChange }: { modo: ModoConfig; onChange: (m: ModoConfig) => void }) {
  return (
    <div>
      <span id="modo-etiqueta" className="config-etiqueta">¿Cómo quieres jugar?</span>
      <div
        role="radiogroup"
        aria-labelledby="modo-etiqueta"
        className={`grid grid-cols-1 gap-3 ${HAY_CUENTAS ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}
      >
        {OPCIONES_MODO.filter((o) => o.id !== "creditos" || HAY_CUENTAS).map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={modo === o.id}
            onClick={() => onChange(o.id)}
            className={`config-modo${modo === o.id ? " config-modo-activo" : ""}`}
          >
            <span className="config-modo-titulo">{o.titulo}</span>
            <span className="config-modo-detalle">{o.detalle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ContadorGratis({ estado }: { estado: EstadoContador }) {
  const agotado = estado.tipo === "agotado";
  return (
    <p className={`config-aviso${agotado ? " config-aviso-alerta" : ""}`} role="status" aria-live="polite">
      {textoContador(estado)}
    </p>
  );
}

function ConexionOpenRouter(props: {
  conectado: boolean;
  estado: "libre" | "trabajando" | "error";
  mensaje?: string;
  onConectar: () => void;
  onDesconectar: () => void;
}) {
  const { conectado, estado, mensaje, onConectar, onDesconectar } = props;
  if (estado === "trabajando") {
    return (
      <p className="config-aviso" role="status" aria-live="polite">
        Conectando con OpenRouter…
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {estado === "error" && (
        <p className="config-aviso config-aviso-alerta" role="alert">
          {mensaje}
        </p>
      )}
      {conectado ? (
        <p className="config-aviso" role="status">
          Conectado con OpenRouter.{" "}
          <button type="button" onClick={onDesconectar} className="underline">
            Desconectar
          </button>
        </p>
      ) : (
        <button type="button" onClick={onConectar} className="config-iniciar">
          Conectar con OpenRouter
        </button>
      )}
    </div>
  );
}
