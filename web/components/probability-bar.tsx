"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { AgentRole } from "@/lib/types";

interface Props {
  /** Probability in [0, 1]. Bar width = probability × 100%. */
  probability: number;
  role: AgentRole;
}

/**
 * Animated horizontal probability bar. Bull = emerald, Bear = rose,
 * matching the Delphi outcome-bar palette. Track stays neutral so the
 * fill reads strongly in both light and dark mode.
 */
export function ProbabilityBar({ probability, role }: Props) {
  const clamped = Math.max(0, Math.min(1, probability));
  const fill =
    role === "bull"
      ? "bg-emerald-500"
      : "bg-rose-500";

  return (
    <div className="relative w-full">
      <div className="relative h-3.5 w-full overflow-hidden rounded-full border border-ink/20 bg-stone-100 dark:border-stone-100/15 dark:bg-stone-800">
        <motion.div
          className={cn("h-full rounded-full", fill)}
          initial={false}
          animate={{ width: `${clamped * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        {/* 50% midline tick */}
        <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-ink/30 dark:bg-stone-100/30" />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-muted dark:text-stone-400">
        <span>0.00</span>
        <span>0.50</span>
        <span>1.00</span>
      </div>
    </div>
  );
}
