"use client";

import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentAvatar } from "./agent-avatar";
import { ProbabilityBar } from "./probability-bar";
import { cn } from "@/lib/cn";
import type { AgentRole } from "@/lib/types";

interface Props {
  role: AgentRole;
  /** Latest probability for this role. null if no turn yet. */
  probability: number | null;
  /** Latest round produced by this role. null if no turn yet. */
  round: number | null;
  /** True when it's this agent's turn but they haven't produced yet. */
  thinking: boolean;
}

const COPY = {
  bull: { name: "Bull", verb: "argues YES" },
  bear: { name: "Bear", verb: "argues NO" },
} as const;

export function AgentCard({ role, probability, round, thinking }: Props) {
  const isBull = role === "bull";
  const { name, verb } = COPY[role];
  const accent = isBull ? "border-emerald-500/30" : "border-rose-500/30";
  const numColor = isBull ? "text-emerald-300" : "text-rose-300";

  const probLabel = probability == null ? "—" : probability.toFixed(3);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-slate-900/40 p-5",
        accent,
        isBull ? "glow-bull" : "glow-bear",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <AgentAvatar role={role} thinking={thinking} />
          <div>
            <p className={cn("font-mono text-sm font-semibold", numColor)}>
              {name}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {verb}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            round
          </p>
          <p className="font-mono text-sm text-slate-300">
            {round == null ? "—" : `r${round}`}
          </p>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={probLabel}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "font-mono text-5xl font-semibold tabular-nums tracking-tight",
              numColor,
            )}
          >
            {probLabel}
          </motion.span>
        </AnimatePresence>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          P(YES)
        </span>
      </div>

      <ProbabilityBar
        probability={probability ?? 0}
        role={role}
      />

      <div className="h-5">
        {thinking && (
          <span className="inline-flex items-center gap-2 font-mono text-xs text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking…
          </span>
        )}
      </div>
    </div>
  );
}
