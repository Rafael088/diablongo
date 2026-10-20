"use client";

import { motion } from "framer-motion";
import { DebaterConfig } from "@/types";
import { Shield, Sword, Cpu } from "lucide-react";

interface DebaterCardProps {
  config: DebaterConfig;
  isActive: boolean;
  color: "emerald" | "rose";
}

export default function DebaterCard({ config, isActive, color }: DebaterCardProps) {
  const isPro = config.role === "pro";
  const Icon = isPro ? Shield : Sword;
  const gradient =
    color === "emerald"
      ? "from-emerald-500/20 to-teal-500/5 border-emerald-500/30"
      : "from-rose-500/20 to-orange-500/5 border-rose-500/30";
  const glow =
    color === "emerald"
      ? "shadow-emerald-500/20"
      : "shadow-rose-500/20";

  return (
    <motion.div
      animate={
        isActive
          ? { scale: 1.02, boxShadow: "0 0 30px rgba(99, 102, 241, 0.15)" }
          : { scale: 1, boxShadow: "0 0 0px rgba(0,0,0,0)" }
      }
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b ${gradient} p-5 backdrop-blur-sm ${
        isActive ? `shadow-lg ${glow}` : "opacity-80"
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute inset-0 border-2 border-white/20 rounded-2xl"
          transition={{ duration: 0.3 }}
        />
      )}

      <div className="relative flex items-center gap-4">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-xl ${
            color === "emerald" ? "bg-emerald-500/20" : "bg-rose-500/20"
          }`}
        >
          <Icon
            className={`h-7 w-7 ${
              color === "emerald" ? "text-emerald-400" : "text-rose-400"
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white truncate">{config.name}</h3>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Cpu className="w-3 h-3" />
            <span className="truncate">{config.model}</span>
          </div>
        </div>

        <div
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            isPro
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-rose-500/20 text-rose-300"
          }`}
        >
          {isPro ? "PRO" : "CON"}
        </div>
      </div>

      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative mt-3 flex items-center gap-2"
        >
          <span
            className={`inline-block w-2 h-2 rounded-full animate-pulse ${
              color === "emerald" ? "bg-emerald-400" : "bg-rose-400"
            }`}
          />
          <span className="text-xs text-zinc-300">Pensando...</span>
        </motion.div>
      )}
    </motion.div>
  );
}
