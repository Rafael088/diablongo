"use client";

import { useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { proveedoresDisponibles, getProviderById } from "@/lib/providers";
import { DebateConfig, DebaterConfig, ProviderConfig } from "@/types";
import { getConfig, saveConfig, SavedConfig } from "@/lib/storage";
import { Swords, Settings2, Eye, EyeOff } from "lucide-react";
import { AVISO_RECORDAR, estaRecordada, guardarKey, leerKey, olvidarKey } from "@/lib/keys";
import { MAX_TEMA } from "@/lib/topes";
import { PROVEEDOR_GRATIS } from "@/lib/gratis";

interface ConfigPanelProps {
  onStart: (config: DebateConfig) => void;
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

// Un proveedor guardado que ya no está disponible (p. ej. ollama en producción) cae al primero.
// Modo «Gratis» (el servidor pone key y modelo): es el valor por defecto si la persona no tiene ninguna key guardada.
function proveedorValido(
  id: string | undefined,
  disponibles: ProviderConfig[],
  hayKeys: boolean
): string {
  if (id === PROVEEDOR_GRATIS) return PROVEEDOR_GRATIS;
  if (!hayKeys) return PROVEEDOR_GRATIS;
  return disponibles.find((p) => p.id === id)?.id ?? disponibles[0].id;
}

function ConfigForm({ saved, onStart }: ConfigPanelProps & { saved: SavedConfig | null }) {
  const disponibles = proveedoresDisponibles();
  const porDefecto = disponibles[0];
  const hayKeys = disponibles.some((p) => leerKey(p.id) !== "");
  const [topic, setTopic] = useState((saved?.topic ?? "").slice(0, MAX_TEMA));

  const [proProvider, setProProvider] = useState(proveedorValido(saved?.proProvider, disponibles, hayKeys));
  const [proModelRaw, setProModel] = useState(saved?.proModel ?? porDefecto.models[0]);

  const [conProvider, setConProvider] = useState(proveedorValido(saved?.conProvider, disponibles, hayKeys));
  const [conModelRaw, setConModel] = useState(saved?.conModel ?? porDefecto.models[1]);

  // Una key por proveedor (si Ángel y Diablo usan el mismo, comparten key).
  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(disponibles.map((p) => [p.id, leerKey(p.id)]))
  );
  const [recordar, setRecordar] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(disponibles.map((p) => [p.id, estaRecordada(p.id)]))
  );
  const proApiKey = keys[proProvider] ?? "";
  const conApiKey = keys[conProvider] ?? "";
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

  const proModel = modeloValido(proProvider, proModelRaw);
  const conModel = modeloValido(conProvider, conModelRaw);

  const handleStart = () => {
    if (!topic.trim()) return;

    saveConfig({
      topic,
      proProvider,
      proModel,
      conProvider,
      conModel,
    });
    for (const id of new Set([proProvider, conProvider])) {
      if (getProviderById(id)?.requiresApiKey) {
        guardarKey(id, keys[id] ?? "", { recordar: recordar[id] ?? false });
      }
    }

    const pro: DebaterConfig = {
      role: "pro",
      provider: proProvider,
      model: proProvider === PROVEEDOR_GRATIS ? "" : proModel,
      apiKey: proProvider === PROVEEDOR_GRATIS ? "" : proApiKey,
      name: "PRO",
    };

    const con: DebaterConfig = {
      role: "con",
      provider: conProvider,
      model: conProvider === PROVEEDOR_GRATIS ? "" : conModel,
      apiKey: conProvider === PROVEEDOR_GRATIS ? "" : conApiKey,
      name: "CON",
    };

    onStart({ topic: topic.trim(), pro, con });
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DebaterForm
              title="Defensor (PRO)"
              color="pro"
              provider={proProvider}
              model={proModel}
              apiKey={proApiKey}
              recordar={recordar[proProvider] ?? false}
              onProviderChange={setProProvider}
              onModelChange={setProModel}
              onApiKeyChange={(v) => cambiarKey(proProvider, v)}
              onRecordarChange={(v) => cambiarRecordar(proProvider, v)}
              onDesconectar={() => desconectar(proProvider)}
            />
            <DebaterForm
              title="Opositor (CON)"
              color="con"
              provider={conProvider}
              model={conModel}
              apiKey={conApiKey}
              recordar={recordar[conProvider] ?? false}
              onProviderChange={setConProvider}
              onModelChange={setConModel}
              onApiKeyChange={(v) => cambiarKey(conProvider, v)}
              onRecordarChange={(v) => cambiarRecordar(conProvider, v)}
              onDesconectar={() => desconectar(conProvider)}
            />
          </div>

          <button
            onClick={handleStart}
            disabled={!topic.trim()}
            className="config-iniciar"
          >
            Iniciar Debate
          </button>

          <p className="config-nota">
            Tu API key se guarda solo en esta pestaña y se borra al cerrarla, salvo que marques «Recordar en este dispositivo». Nunca se envía a ningún servidor propio.
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

      <div>
        <label className="config-etiqueta">Proveedor</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className="config-campo"
        >
          <option value={PROVEEDOR_GRATIS}>Gratis (sin key)</option>
          {proveedoresDisponibles().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {provider === PROVEEDOR_GRATIS && (
        <p className="text-xs opacity-70">
          Sin key: el modelo lo elige el servidor entre modelos gratuitos.
        </p>
      )}

      {provider !== PROVEEDOR_GRATIS && (
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
      )}

      {providerConfig?.requiresApiKey && (
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
