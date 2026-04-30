"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Radio } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TurnRecord } from "@/lib/types";

interface Props {
  turns: TurnRecord[];
}

interface AxlEvent {
  id: string;
  ts: string;
  from: "bull" | "bear";
  to: "bull" | "bear";
  round: number;
  bytes: number;
  isFinal: boolean;
}

/**
 * Each persisted turn implies a /send by the producer + /recv by the
 * peer. We render that as a single line item; bytes ≈ JSON length of
 * the TurnRecord (good enough proof of "AXL is doing the work").
 */
function deriveEvents(turns: TurnRecord[]): AxlEvent[] {
  return turns.map((t) => {
    const peer: "bull" | "bear" = t.role === "bull" ? "bear" : "bull";
    return {
      id: `${t.duel_id}-${t.round}`,
      ts: t.produced_at,
      from: t.role,
      to: peer,
      round: t.round,
      // Proxy for the over-the-wire byte count: JSON of the turn payload.
      bytes: JSON.stringify(t).length,
      isFinal: t.is_final,
    };
  });
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toTimeString().slice(0, 8); // HH:MM:SS
  } catch {
    return iso.slice(11, 19);
  }
}

export function AxlLog({ turns }: Props) {
  const events = deriveEvents(turns);

  const roleColor = (r: "bull" | "bear") =>
    r === "bull"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  return (
    <section className="rounded-2xl border border-ink bg-white dark:border-stone-100 dark:bg-stone-900">
      <div className="flex items-start gap-3 border-b border-ink/15 px-5 py-4 dark:border-stone-100/15">
        <Radio className="mt-0.5 h-4 w-4 shrink-0 text-ink dark:text-stone-100" />
        <div className="flex-1">
          <p className="font-mono text-sm font-semibold uppercase tracking-wider text-ink dark:text-stone-100">
            Mesh Traffic
          </p>
          <p className="text-sm text-ink-muted dark:text-stone-400">
            peer-to-peer messages crossing the AXL nodes
          </p>
        </div>
        <span className="font-mono text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">
          send / recv
        </span>
      </div>
      <div className="max-h-44 overflow-y-auto px-5 py-3 font-mono text-xs">
        {events.length === 0 ? (
          <p className="py-3 text-center text-ink-muted dark:text-stone-400">
            no AXL traffic yet — start a duel
          </p>
        ) : (
          <ol className="space-y-1.5">
            <AnimatePresence initial={false}>
              {events.map((e) => (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 text-ink dark:text-stone-100"
                >
                  <span className="text-ink-muted dark:text-stone-500">[{formatTime(e.ts)}]</span>
                  <span className={cn("font-semibold", roleColor(e.from))}>{e.from}</span>
                  <span className="text-ink-muted dark:text-stone-500">→</span>
                  <span className={cn("font-semibold", roleColor(e.to))}>{e.to}</span>
                  <span>
                    : turn r{e.round}{e.isFinal ? " (final)" : ""}
                  </span>
                  <span className="ml-auto text-ink-muted dark:text-stone-500">{e.bytes} B</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </section>
  );
}
