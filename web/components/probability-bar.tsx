"use client";

import { motion } from "framer-motion";

interface Props {
  /** Probability in [0, 1]. Bar width = probability × 100%. */
  probability: number;
}

/**
 * Animated horizontal probability bar. Solid black fill on a white track
 * with a thin black border. Bull and bear share the same visual; they're
 * distinguished by card position and label, not by color.
 */
export function ProbabilityBar({ probability }: Props) {
  const clamped = Math.max(0, Math.min(1, probability));

  return (
    <div className="relative w-full">
      <div className="relative h-3 w-full overflow-hidden rounded-full border border-black bg-white">
        <motion.div
          className="h-full rounded-full bg-black"
          initial={false}
          animate={{ width: `${clamped * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        {/* 50% midline tick */}
        <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-gray-400" />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-gray-500">
        <span>0.00</span>
        <span>0.50</span>
        <span>1.00</span>
      </div>
    </div>
  );
}
