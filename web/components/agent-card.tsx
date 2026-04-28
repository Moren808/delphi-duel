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
  const { name, verb } = COPY[role];
  const probLabel = probability == null ? "—" : probability.toFixed(3);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <AgentAvatar role={role} thinking={thinking} />
          <div>
            <p className="font-mono text-sm font-semibold text-black">{name}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
              {verb}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
            round
          </p>
          <p className="font-mono text-sm text-black">
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
            className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-black"
          >
            {probLabel}
          </motion.span>
        </AnimatePresence>
        <span className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
          P(YES)
        </span>
      </div>

      <ProbabilityBar probability={probability ?? 0} />

      <div className="h-5">
        {thinking && (
          <span className="inline-flex items-center gap-2 font-mono text-xs text-gray-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking…
          </span>
        )}
      </div>
    </div>
  );
}
