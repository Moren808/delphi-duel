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
      <section className="rounded-2xl border border-ink bg-white p-8 text-center dark:border-stone-100 dark:bg-stone-900">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">
          transcript
        </p>
        <p className="mt-3 text-base text-ink-muted dark:text-stone-400">
          waiting for the first turn…
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-ink bg-white dark:border-stone-100 dark:bg-stone-900">
      <div className="flex items-center justify-between border-b border-ink/15 px-6 py-4 dark:border-stone-100/15">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">
          transcript
        </p>
        <p className="font-mono text-xs text-ink-muted dark:text-stone-400">
          {turns.length} turn{turns.length === 1 ? "" : "s"}
        </p>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[32rem] overflow-y-auto px-6 py-5"
      >
        <ol className="space-y-4">
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
  const isBull = turn.role === "bull";
  const accent = isBull
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  const cardBorder = isBull
    ? "border-emerald-500/40"
    : "border-rose-500/40";
  const ringColor = isBull
    ? "ring-emerald-500/60"
    : "ring-rose-500/60";
  const finalChip = isBull
    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
    : "border-rose-500 text-rose-600 dark:text-rose-400";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "flex items-start gap-4 rounded-xl border-2 bg-cream p-5 dark:bg-stone-950",
        cardBorder,
        isLatest && cn("ring-2", ringColor),
      )}
    >
      <AgentAvatar role={turn.role} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("font-mono text-sm font-semibold uppercase tracking-wider", accent)}>
            {turn.role}
          </span>
          <span className="font-mono text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">
            round {turn.round}
          </span>
          <span className="ml-auto font-mono text-sm tabular-nums text-ink-muted dark:text-stone-400">
            P(YES) <span className={cn("font-semibold", accent)}>{turn.probability.toFixed(3)}</span>
          </span>
          {turn.is_final && (
            <span className={cn(
              "rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider",
              finalChip,
            )}>
              final
            </span>
          )}
        </div>
        <p className="text-base leading-relaxed text-ink dark:text-stone-100">
          {turn.message_to_peer}
        </p>
      </div>
    </motion.li>
  );
}
