"use client";

import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentAvatar } from "./agent-avatar";
import { ProbabilityBar } from "./probability-bar";
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
  const probLabel = probability == null ? "—" : probability.toFixed(3);
  const accentText = isBull
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-ink bg-white p-6 dark:border-stone-100 dark:bg-stone-900">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <AgentAvatar role={role} thinking={thinking} />
          <div>
            <p className="text-2xl font-bold tracking-tight text-ink dark:text-stone-100">
              {name}
            </p>
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
              {verb}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            round
          </p>
          <p className="font-mono text-base font-semibold text-ink dark:text-stone-100">
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
            className={`font-mono text-7xl font-bold tabular-nums tracking-tight ${accentText}`}
          >
            {probLabel}
          </motion.span>
        </AnimatePresence>
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-stone-400">
          P(YES)
        </span>
      </div>

      <ProbabilityBar probability={probability ?? 0} role={role} />

      <div className="h-6">
        {thinking && (
          <span className={`inline-flex items-center gap-2 font-mono text-sm ${accentText}`}>
            <Loader2 className="h-4 w-4 animate-spin" />
            thinking…
          </span>
        )}
      </div>
    </div>
  );
}
