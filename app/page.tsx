"use client";

import { useState } from "react";
import { DebateConfig } from "@/types";
import ConfigPanel from "@/components/ConfigPanel";
import DebateArena from "@/components/DebateArena";

export default function Home() {
  const [config, setConfig] = useState<DebateConfig | null>(null);

  return (
    <main className="min-h-screen py-8 px-4">
      {config ? (
        <DebateArena config={config} onReset={() => setConfig(null)} />
      ) : (
        <ConfigPanel onStart={setConfig} />
      )}
    </main>
  );
}
