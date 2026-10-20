"use client";

import { useState } from "react";
import { DebateConfig } from "@/types";
import ConfigPanel from "@/components/ConfigPanel";
import DebateArena from "@/components/DebateArena";

export default function Home() {
  const [config, setConfig] = useState<DebateConfig | null>(null);
  // Token de Turnstile de un solo uso: lo consume /api/debate/start; «Jugar otra vez» pide uno nuevo.
  const [turnstile, setTurnstile] = useState<string | undefined>(undefined);

  return (
    <main className="min-h-screen py-8 px-4">
      {config ? (
        <DebateArena
          config={config}
          turnstile={turnstile}
          onReset={() => {
            setConfig(null);
            setTurnstile(undefined);
          }}
        />
      ) : (
        <ConfigPanel
          onStart={(nueva, token) => {
            setTurnstile(token);
            setConfig(nueva);
          }}
        />
      )}
    </main>
  );
}
