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
 * Animated horizontal probability bar. The fill animates with
 * framer-motion (500ms ease) whenever the probability prop changes.
 * The track shows a subtle 50% midline so the viewer can read
 * over/under-50 at a glance.
 */
export function ProbabilityBar({ probability, role }: Props) {
  const clamped = Math.max(0, Math.min(1, probability));
  const fill = role === "bull" ? "bg-emerald-500" : "bg-rose-500";
  const glow =
    role === "bull"
      ? "shadow-[0_0_12px_-2px_rgba(34,197,94,0.6)]"
      : "shadow-[0_0_12px_-2px_rgba(239,68,68,0.6)]";

  return (
    <div className="relative w-full">
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-900 ring-1 ring-inset ring-slate-800">
        <motion.div
          className={cn("h-full rounded-full", fill, glow)}
          initial={false}
          animate={{ width: `${clamped * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        {/* 50% midline */}
        <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-slate-700/70" />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>0.00</span>
        <span>0.50</span>
        <span>1.00</span>
      </div>
    </div>
  );
}
