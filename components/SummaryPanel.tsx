"use client";

import { motion } from "framer-motion";
import { DebateMessage } from "@/types";
import { Trophy, Scale, Sparkles } from "lucide-react";

interface SummaryPanelProps {
  messages: DebateMessage[];
  topic: string;
  onNewDebate: () => void;
}

export default function SummaryPanel({ messages, topic, onNewDebate }: SummaryPanelProps) {
  const proArgs = messages.filter((m) => m.role === "pro");
  const conArgs = messages.filter((m) => m.role === "con");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-2xl"
    >
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="p-3 bg-indigo-500/20 rounded-xl">
          <Trophy className="w-8 h-8 text-indigo-400" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white">Debate finalizado</h2>
      </div>

      <p className="text-zinc-400 text-center mb-8 italic">&quot;{topic}&quot;</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <SummaryColumn
          title="Argumentos PRO"
          color="emerald"
          messages={proArgs}
        />
        <SummaryColumn
          title="Argumentos CON"
          color="rose"
          messages={conArgs}
        />
      </div>

      <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Scale className="w-5 h-5 text-zinc-400" />
          <h3 className="font-bold text-white">Nota del moderador</h3>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Este debate fue moderado por reglas simples. La decisión final es tuya.
          Revisa los argumentos de ambos lados y elige la posición que consideres más sólida
          para tu contexto.
        </p>
      </div>

      <button
        onClick={onNewDebate}
        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        <Sparkles className="w-5 h-5" />
        Nuevo debate
      </button>
    </motion.div>
  );
}

interface SummaryColumnProps {
  title: string;
  color: "emerald" | "rose";
  messages: DebateMessage[];
}

function SummaryColumn({ title, color, messages }: SummaryColumnProps) {
  const colorClasses = {
    emerald: "border-emerald-500/20 bg-emerald-500/5",
    rose: "border-rose-500/20 bg-rose-500/5",
  }[color];

  const titleClasses = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
  }[color];

  return (
    <div className={`border rounded-xl p-4 ${colorClasses}`}>
      <h3 className={`font-bold mb-3 ${titleClasses}`}>{title}</h3>
      <ul className="space-y-3">
        {messages.map((msg, index) => (
          <li key={index} className="text-sm text-zinc-300 leading-relaxed">
            <span className="text-zinc-500 text-xs block mb-1">
              {msg.phase} {msg.round > 0 && `· ronda ${msg.round}`}
            </span>
            {msg.content.length > 200
              ? `${msg.content.slice(0, 200)}...`
              : msg.content}
          </li>
        ))}
      </ul>
    </div>
  );
}
