"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentAvatar } from "./agent-avatar";
import { cn } from "@/lib/cn";
import type { TurnRecord } from "@/lib/types";

interface Props {
  turns: TurnRecord[];
}

/**
 * Scrollable transcript feed. Each turn renders as a card, color-coded
 * by role. Newest turn slides in from below and the container
 * autoscrolls to keep it in view.
 */
export function TranscriptPane({ turns }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastLen = useRef(0);

  useEffect(() => {
    if (turns.length > lastLen.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    lastLen.current = turns.length;
  }, [turns]);

  if (turns.length === 0) {
    return (
      <section className="rounded-xl border border-black bg-white p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-wider text-gray-600">
          transcript
        </p>
        <p className="mt-3 font-mono text-sm text-gray-500">
          waiting for the first turn…
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-black bg-white">
      <div className="flex items-center justify-between border-b border-black px-5 py-3">
        <p className="font-mono text-xs uppercase tracking-wider text-gray-600">
          transcript
        </p>
        <p className="font-mono text-[10px] text-gray-500">
          {turns.length} turn{turns.length === 1 ? "" : "s"}
        </p>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[28rem] overflow-y-auto px-5 py-4"
      >
        <ol className="space-y-3">
          <AnimatePresence initial={false}>
            {turns.map((t, i) => (
              <TurnRow key={`${t.duel_id}-${t.round}`} turn={t} isLatest={i === turns.length - 1} />
            ))}
          </AnimatePresence>
        </ol>
      </div>
    </section>
  );
}

function TurnRow({ turn, isLatest }: { turn: TurnRecord; isLatest: boolean }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-black bg-white p-4",
        // Latest turn gets a slightly thicker double-stroke effect via a
        // 2px-equivalent ring rather than a colored ring.
        isLatest && "ring-2 ring-black ring-offset-2 ring-offset-white",
      )}
    >
      <AgentAvatar role={turn.role} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-semibold uppercase text-black">
            {turn.role}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
            round {turn.round}
          </span>
          <span className="ml-auto font-mono text-xs tabular-nums text-gray-700">
            P(YES) <span className="font-semibold text-black">{turn.probability.toFixed(3)}</span>
          </span>
          {turn.is_final && (
            <span className="rounded border border-black px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-black">
              final
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-black">
          {turn.message_to_peer}
        </p>
      </div>
    </motion.li>
  );
}
