"use client";

import { motion } from "framer-motion";
import { DebateMessage, DebatePhase } from "@/types";
import { MessageSquare } from "lucide-react";

interface ArgumentBubbleProps {
  message: DebateMessage;
  index: number;
}

const phaseLabels: Record<DebatePhase, string> = {
  opening: "Apertura",
  rebuttal: "Refutación",
  counter: "Contraargumento",
  closing: "Cierre",
  intervention: "Intervención",
};

export default function ArgumentBubble({ message, index }: ArgumentBubbleProps) {
  const isPro = message.role === "pro";

  return (
    <motion.div
      initial={{ opacity: 0, x: isPro ? -50 : 50, y: 20 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className={`flex ${isPro ? "justify-start" : "justify-end"} mb-6`}
    >
      <div
        className={`relative max-w-[85%] md:max-w-[70%] rounded-2xl px-5 py-4 ${
          isPro
            ? "bg-emerald-500/10 border border-emerald-500/20 rounded-tl-sm"
            : "bg-rose-500/10 border border-rose-500/20 rounded-tr-sm"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare
            className={`w-4 h-4 ${isPro ? "text-emerald-400" : "text-rose-400"}`}
          />
          <span
            className={`text-xs font-bold ${
              isPro ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isPro ? "PRO" : "CON"}
          </span>
          <span className="text-xs text-zinc-500">
            {phaseLabels[message.phase]} {message.round > 0 && `· Ronda ${message.round}`}
          </span>
        </div>

        <div className="text-zinc-200 text-sm md:text-base leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </motion.div>
  );
}
