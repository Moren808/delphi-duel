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

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <Radio className="h-3.5 w-3.5 text-slate-500" />
        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          AXL activity
        </p>
        <span className="ml-auto font-mono text-[10px] text-slate-600">
          send / recv
        </span>
      </div>
      <div className="max-h-44 overflow-y-auto px-4 py-2 font-mono text-[11px]">
        {events.length === 0 ? (
          <p className="py-3 text-center text-slate-600">
            no AXL traffic yet — start a duel
          </p>
        ) : (
          <ol className="space-y-1">
            <AnimatePresence initial={false}>
              {events.map((e) => (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 text-slate-400"
                >
                  <span className="text-slate-600">[{formatTime(e.ts)}]</span>
                  <span className={cn(e.from === "bull" ? "text-emerald-400" : "text-rose-400")}>
                    {e.from}
                  </span>
                  <span className="text-slate-600">→</span>
                  <span className={cn(e.to === "bull" ? "text-emerald-400" : "text-rose-400")}>
                    {e.to}
                  </span>
                  <span className="text-slate-300">
                    : turn r{e.round}{e.isFinal ? " (final)" : ""}
                  </span>
                  <span className="ml-auto text-slate-500">{e.bytes} B</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </section>
  );
}
