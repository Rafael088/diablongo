"use client";

import { useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { providers, getProviderById } from "@/lib/providers";
import { DebateConfig, DebaterConfig } from "@/types";
import { getConfig, saveConfig, SavedConfig } from "@/lib/storage";
import { Swords, Settings2 } from "lucide-react";

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

function ConfigForm({ saved, onStart }: ConfigPanelProps & { saved: SavedConfig | null }) {
  const [topic, setTopic] = useState(saved?.topic ?? "");

  const [proProvider, setProProvider] = useState(saved?.proProvider ?? "openrouter");
  const [proModelRaw, setProModel] = useState(saved?.proModel ?? providers[0].models[0]);
  const [proApiKey, setProApiKey] = useState(saved?.proApiKey || "");

  const [conProvider, setConProvider] = useState(saved?.conProvider ?? "openrouter");
  const [conModelRaw, setConModel] = useState(saved?.conModel ?? providers[0].models[1]);
  const [conApiKey, setConApiKey] = useState(saved?.conApiKey || "");

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
      proApiKey,
      conApiKey,
    });

    const pro: DebaterConfig = {
      role: "pro",
      provider: proProvider,
      model: proModel,
      apiKey: proApiKey,
      name: "PRO",
    };

    const con: DebaterConfig = {
      role: "con",
      provider: conProvider,
      model: conModel,
      apiKey: conApiKey,
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
              className="config-campo h-24 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DebaterForm
              title="Defensor (PRO)"
              color="pro"
              provider={proProvider}
              model={proModel}
              apiKey={proApiKey}
              onProviderChange={setProProvider}
              onModelChange={setProModel}
              onApiKeyChange={setProApiKey}
            />
            <DebaterForm
              title="Opositor (CON)"
              color="con"
              provider={conProvider}
              model={conModel}
              apiKey={conApiKey}
              onProviderChange={setConProvider}
              onModelChange={setConModel}
              onApiKeyChange={setConApiKey}
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
            Las API keys se guardan ofuscadas en tu navegador. Nunca se envían a ningún servidor propio.
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
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (apiKey: string) => void;
}

function DebaterForm({
  title,
  color,
  provider,
  model,
  apiKey,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
}: DebaterFormProps) {
  const providerConfig = getProviderById(provider);

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
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

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

      {providerConfig?.requiresApiKey && (
        <div>
          <label className="config-etiqueta">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={`Tu key de ${providerConfig.name}`}
            className="config-campo"
          />
        </div>
      )}
    </div>
  );
}
