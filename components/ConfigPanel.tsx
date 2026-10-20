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
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-indigo-500/20 rounded-xl">
            <Swords className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Agent Debate</h1>
            <p className="text-zinc-400">Pon a dos IAs a debatir cualquier tema</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Tema o propuesta a debatir
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="¿Deberíamos migrar nuestra base de datos a PostgreSQL?"
              className="w-full h-24 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DebaterForm
              title="Defensor (PRO)"
              color="emerald"
              provider={proProvider}
              model={proModel}
              apiKey={proApiKey}
              onProviderChange={setProProvider}
              onModelChange={setProModel}
              onApiKeyChange={setProApiKey}
            />
            <DebaterForm
              title="Opositor (CON)"
              color="rose"
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
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/25"
          >
            Iniciar Debate
          </button>

          <p className="text-xs text-zinc-500 text-center">
            Las API keys se guardan ofuscadas en tu navegador. Nunca se envían a ningún servidor propio.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

interface DebaterFormProps {
  title: string;
  color: "emerald" | "rose";
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

  const styles = {
    emerald: {
      border: "border-emerald-500/30",
      focus: "focus:ring-emerald-500",
      icon: "text-emerald-400",
      title: "text-emerald-400",
    },
    rose: {
      border: "border-rose-500/30",
      focus: "focus:ring-rose-500",
      icon: "text-rose-400",
      title: "text-rose-400",
    },
  }[color];

  return (
    <div className={`bg-zinc-950/50 border ${styles.border} rounded-xl p-5 space-y-4`}>
      <div className="flex items-center gap-2">
        <Settings2 className={`w-5 h-5 ${styles.icon}`} />
        <h3 className={`font-bold ${styles.title}`}>{title}</h3>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">Proveedor</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className={`w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 ${styles.focus}`}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">Modelo</label>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className={`w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 ${styles.focus}`}
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
          <label className="block text-xs font-medium text-zinc-400 mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={`Tu key de ${providerConfig.name}`}
            className={`w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 ${styles.focus}`}
          />
        </div>
      )}
    </div>
  );
}
