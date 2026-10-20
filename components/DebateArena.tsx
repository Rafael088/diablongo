"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DebateConfig, DebateMessage, DebateRole } from "@/types";
import { getInitialTurn, getNextPhase } from "@/lib/debateEngine";
import { saveDebate } from "@/lib/storage";
import DebaterCard from "./DebaterCard";
import ArgumentBubble from "./ArgumentBubble";
import DebateControls from "./DebateControls";
import SummaryPanel from "./SummaryPanel";

interface DebateArenaProps {
  config: DebateConfig;
  onReset: () => void;
}

export default function DebateArena({ config, onReset }: DebateArenaProps) {
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "finished">("idle");
  const [currentTurn, setCurrentTurn] = useState<{ phase: string; round: number; speaker: DebateRole } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef(false);
  const messagesRef = useRef<DebateMessage[]>([]);
  const currentTurnRef = useRef<{ phase: string; round: number; speaker: DebateRole } | null>(null);
  const statusRef = useRef(status);

  // Keep refs in sync
  messagesRef.current = messages;
  currentTurnRef.current = currentTurn;
  statusRef.current = status;

  const executeTurn = useCallback(
    async (speaker: DebateRole, phase: string, round: number, intervention?: string): Promise<boolean> => {
      const debater = speaker === "pro" ? config.pro : config.con;
      setCurrentTurn({ speaker, phase, round });
      setError(null);

      try {
        const response = await fetch("/api/debate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: config.topic,
            role: speaker,
            phase,
            provider: debater.provider,
            model: debater.model,
            apiKey: debater.apiKey,
            history: messagesRef.current,
            intervention,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Error ${response.status}`);
        }

        const data = await response.json();

        const newMessage: DebateMessage = {
          role: speaker,
          content: data.content,
          round,
          phase: phase as DebateMessage["phase"],
        };

        const updated = [...messagesRef.current, newMessage];
        setMessages(updated);
        messagesRef.current = updated;
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        setError(message);
        setStatus("paused");
        pendingRef.current = false;
        return false;
      }
    },
    [config]
  );

  const runNextTurn = useCallback(async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;

    const turn = currentTurnRef.current
      ? {
          phase: currentTurnRef.current.phase,
          round: currentTurnRef.current.round,
          nextSpeaker: currentTurnRef.current.speaker,
        }
      : getInitialTurn();

    const success = await executeTurn(turn.nextSpeaker, turn.phase, turn.round);

    if (!success) {
      pendingRef.current = false;
      return;
    }

    const next = getNextPhase(
      turn.phase as DebateMessage["phase"],
      turn.round,
      config.rounds,
      turn.nextSpeaker
    );

    const finished =
      turn.phase === "closing" && turn.nextSpeaker === "con";

    if (finished) {
      setStatus("finished");
      pendingRef.current = false;
      const finalState = {
        id: Date.now().toString(),
        topic: config.topic,
        rounds: config.rounds,
        currentRound: turn.round,
        messages: messagesRef.current,
        status: "finished" as const,
      };
      saveDebate(finalState);
      return;
    }

    setCurrentTurn({
      speaker: next.nextSpeaker,
      phase: next.phase,
      round: next.round,
    });

    pendingRef.current = false;

    if (statusRef.current === "running") {
      setTimeout(() => {
        if (statusRef.current === "running") {
          runNextTurn();
        }
      }, 1200);
    }
  }, [config.rounds, executeTurn, status]);

  const handlePlayPause = () => {
    if (status === "running") {
      setStatus("paused");
    } else {
      setStatus("running");
      setTimeout(runNextTurn, 100);
    }
  };

  const handleIntervene = async (text: string, target: "pro" | "con") => {
    if (status === "finished") return;

    setStatus("paused");
    pendingRef.current = false;

    const success = await executeTurn(target, "intervention", currentTurnRef.current?.round || 1, text);
    if (success) {
      setStatus("running");
      setTimeout(runNextTurn, 100);
    }
  };

  const handleReset = () => {
    pendingRef.current = false;
    onReset();
  };

  if (status === "finished") {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <SummaryPanel
          messages={messages}
          topic={config.topic}
          onNewDebate={handleReset}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-4 space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{config.topic}</h2>
        <p className="text-zinc-400 text-sm">
          {config.rounds} rondas · {config.pro.model} vs {config.con.model}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DebaterCard
          config={config.pro}
          isActive={currentTurn?.speaker === "pro"}
          color="emerald"
        />
        <DebaterCard
          config={config.con}
          isActive={currentTurn?.speaker === "con"}
          color="rose"
        />
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 md:p-6 min-h-[300px] max-h-[600px] overflow-y-auto">
        <AnimatePresence>
          {messages.length === 0 && status === "idle" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-zinc-500 py-12"
            >
              <p>Presiona Iniciar para comenzar el debate</p>
            </motion.div>
          )}
          {messages.map((message, index) => (
            <ArgumentBubble key={index} message={message} index={index} />
          ))}
        </AnimatePresence>
        <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })} />
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm"
        >
          <strong>Error:</strong> {error}
        </motion.div>
      )}

      <DebateControls
        status={status}
        onPlayPause={handlePlayPause}
        onReset={handleReset}
        onIntervene={handleIntervene}
      />
    </div>
  );
}
