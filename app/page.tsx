"use client";

import { useState } from "react";
import { DebateConfig } from "@/types";
import ConfigPanel from "@/components/ConfigPanel";
import DebateArena from "@/components/DebateArena";
import Cuenta from "@/components/Cuenta";
import PantallaAyuda from "@/components/PantallaAyuda";
import { categoriaCritica } from "@/lib/temaCritico";

export default function Home() {
  const [config, setConfig] = useState<DebateConfig | null>(null);
  // Token de Turnstile de un solo uso: lo consume /api/debate/start; «Jugar otra vez» pide uno nuevo.
  const [turnstile, setTurnstile] = useState<string | undefined>(undefined);
  // Tema crítico detectado antes de empezar (el servidor vuelve a comprobarlo en /api/debate/start).
  const [ayuda, setAyuda] = useState(false);

  return (
    <main className="min-h-screen py-8 px-4">
      {ayuda ? (
        <PantallaAyuda onVolver={() => setAyuda(false)} />
      ) : config ? (
        <DebateArena
          config={config}
          turnstile={turnstile}
          onReset={() => {
            setConfig(null);
            setTurnstile(undefined);
          }}
        />
      ) : (
        <>
          <Cuenta />
          <ConfigPanel
            onStart={(nueva, token) => {
              if (categoriaCritica(nueva.topic)) {
                setAyuda(true);
                return;
              }
              setTurnstile(token);
              setConfig(nueva);
            }}
          />
        </>
      )}
    </main>
  );
}
