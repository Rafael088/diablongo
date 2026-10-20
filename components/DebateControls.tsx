"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw, MessageCircle, Send } from "lucide-react";

interface DebateControlsProps {
  status: "idle" | "running" | "paused" | "finished";
  onPlayPause: () => void;
  onReset: () => void;
  onIntervene?: (message: string, target: "pro" | "con") => void;
}

export default function DebateControls({
  status,
  onPlayPause,
  onReset,
  onIntervene,
}: DebateControlsProps) {
  const [showIntervention, setShowIntervention] = useState(false);
  const [interventionText, setInterventionText] = useState("");
  const [interventionTarget, setInterventionTarget] = useState<"pro" | "con">("pro");

  const handleIntervene = () => {
    if (!interventionText.trim() || !onIntervene) return;
    onIntervene(interventionText.trim(), interventionTarget);
    setInterventionText("");
    setShowIntervention(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-3">
        {status !== "finished" && (
          <button
            onClick={onPlayPause}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
          >
            {status === "running" ? (
              <>
                <Pause className="w-5 h-5" /> Pausar
              </>
            ) : (
              <>
                <Play className="w-5 h-5" /> {status === "idle" ? "Iniciar" : "Continuar"}
              </>
            )}
          </button>
        )}

        {(status === "running" || status === "paused") && onIntervene && (
          <button
            onClick={() => setShowIntervention(!showIntervention)}
            className="flex items-center gap-2 px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl transition-colors"
          >
            <MessageCircle className="w-5 h-5" /> Intervenir
          </button>
        )}

        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white font-semibold rounded-xl transition-colors"
        >
          <RotateCcw className="w-5 h-5" /> Reiniciar
        </button>
      </div>

      <AnimatePresence>
        {showIntervention && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4"
          >
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setInterventionTarget("pro")}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  interventionTarget === "pro"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                A PRO
              </button>
              <button
                onClick={() => setInterventionTarget("con")}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  interventionTarget === "con"
                    ? "bg-rose-500/20 text-rose-300"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                A CON
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={interventionText}
                onChange={(e) => setInterventionText(e.target.value)}
                placeholder="Escribe tu pregunta o comentario..."
                className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={(e) => e.key === "Enter" && handleIntervene()}
              />
              <button
                onClick={handleIntervene}
                disabled={!interventionText.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
