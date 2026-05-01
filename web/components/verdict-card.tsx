"use client";

import { motion } from "framer-motion";
import { Crown, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchBet, fetchVerdict, type BetResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { VerdictRecord } from "@/lib/types";

const POLL_MS = 1_500;

/** Map outcome index → human label, mirroring BetsCard. */
function outcomeLabel(
  idx: number,
  bullOutcome?: string | null,
  bearOutcome?: string | null,
): string {
  if (bullOutcome && bearOutcome) {
    if (idx === 0) return bullOutcome.toUpperCase();
    if (idx === 1) return bearOutcome.toUpperCase();
    return `OUTCOME #${idx}`;
  }
  if (idx === 0) return "YES";
  if (idx === 1) return "NO";
  return `OUTCOME #${idx}`;
}

interface Props {
  duelId: string;
  /** When true, we know the duel is over — start polling for the verdict. */
  duelComplete: boolean;
  /**
   * Pre-supplied verdict (e.g. when replaying the example fixture).
   * If passed, no polling happens.
   */
  inlineVerdict?: VerdictRecord | null;
  /**
   * Multi-outcome head-to-head: outcome names for bull and bear.
   * When both present, "BULL WINS" is replaced with the bull
   * outcome name (e.g. "OKLAHOMA CITY THUNDER WINS"); same for bear.
   */
  bullOutcome?: string | null;
  bearOutcome?: string | null;
}

const POSITION_BG: Record<string, string> = {
  "strong YES": "bg-emerald-500",
  "moderate YES": "bg-emerald-500/70",
  "neutral": "bg-stone-500",
  "moderate NO": "bg-rose-500/70",
  "strong NO": "bg-rose-500",
};

export function VerdictCard({
  duelId,
  duelComplete,
  inlineVerdict,
  bullOutcome,
  bearOutcome,
}: Props) {
  const [verdict, setVerdict] = useState<VerdictRecord | null>(inlineVerdict ?? null);
  const [polling, setPolling] = useState<boolean>(!inlineVerdict && duelComplete);
  // Bet summary — polled in parallel with verdict so the verdict card and
  // the BetsCard tell the same story together. Null until the judge
  // reaches the betting branch.
  const [bet, setBet] = useState<BetResponse | null>(null);

  // If a fixture verdict was passed, lock it in and don't poll.
  useEffect(() => {
    if (inlineVerdict) {
      setVerdict(inlineVerdict);
      setPolling(false);
    }
  }, [inlineVerdict]);

  useEffect(() => {
    if (inlineVerdict) return;
    if (!duelComplete) return;
    if (verdict) return;

    let cancelled = false;
    setPolling(true);

    const tick = async () => {
      if (cancelled) return;
      try {
        const v = await fetchVerdict(duelId);
        if (cancelled) return;
        if (v) {
          setVerdict(v);
          setPolling(false);
        }
      } catch {
        /* non-fatal — keep polling */
      }
    };
    void tick();
    const id = setInterval(() => {
      if (verdict) {
        clearInterval(id);
        return;
      }
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [duelId, duelComplete, verdict, inlineVerdict]);

  // Bet polling — same cadence as verdict, runs only on real (non-fixture)
  // duels. Stops once we have a terminal row (placed/failed/skipped).
  useEffect(() => {
    if (inlineVerdict) return;
    if (!duelComplete) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await fetchBet(duelId);
        if (!cancelled) setBet(r);
      } catch {
        /* non-fatal */
      }
    };
    void tick();
    const id = setInterval(() => {
      const status = bet?.bet?.status;
      if (status === "placed" || status === "failed" || status === "skipped") {
        clearInterval(id);
        return;
      }
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [duelId, duelComplete, inlineVerdict, bet?.bet?.status]);

  // Don't render until the duel is complete. Avoids visual noise mid-debate.
  if (!duelComplete) return null;

  // While polling, show a placeholder so users see the judge is working.
  if (!verdict) {
    return (
      <section className="rounded-2xl border-2 border-ink bg-ink p-6 text-cream dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="font-mono text-sm font-semibold uppercase tracking-wider">
            judge deliberating…
          </p>
        </div>
        <p className="mt-2 text-sm opacity-70">
          third AXL node received the transcript and is calling Claude with the
          judge prompt. {polling ? "polling for verdict every 1.5s." : ""}
        </p>
      </section>
    );
  }

  // In outcome mode, the judge's "bull"/"bear" winner field maps to
  // the outcome name those agents were defending. Otherwise show the
  // role name as before.
  const isOutcomeMode = Boolean(bullOutcome && bearOutcome);
  const winnerLabel =
    verdict.winner === "inconclusive"
      ? "INCONCLUSIVE"
      : isOutcomeMode
        ? `${(verdict.winner === "bull" ? bullOutcome! : bearOutcome!).toUpperCase()} WINS THE DEBATE`
        : `${verdict.winner.toUpperCase()} WINS`;
  const positionBg = POSITION_BG[verdict.recommended_position] ?? "bg-stone-500";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border-2 border-ink bg-ink p-6 text-cream dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950"
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Crown className="h-6 w-6 text-amber-400 dark:text-amber-500" strokeWidth={2.5} />
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider opacity-70">
              judge verdict
            </p>
            <p className="font-mono text-2xl font-bold tracking-tight">
              {winnerLabel}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] uppercase tracking-wider opacity-70">
            confidence
          </p>
          <p className="font-mono text-2xl font-bold tabular-nums">
            {(verdict.confidence * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Reasoning */}
      <p className="mb-5 text-base leading-relaxed">
        {verdict.reasoning}
      </p>

      {/* Recommended position — large badge */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="font-mono text-[11px] uppercase tracking-wider opacity-70">
          recommended position
        </p>
        <div
          className={cn(
            "inline-flex items-center justify-center rounded-lg px-5 py-3",
            "font-mono text-2xl font-bold uppercase tracking-tight text-white",
            positionBg,
          )}
        >
          {verdict.recommended_position}
        </div>
        <p className="font-mono text-sm opacity-70 sm:ml-auto">
          {verdict.suggested_lean}
        </p>
      </div>

      {/* Auto-bet summary line — appears once the judge has reached the
          betting branch and AUTO_BET is enabled server-side. Mirrors the
          BetsCard so both surfaces tell the same story at a glance. */}
      {bet?.auto_bet_enabled && bet.bet && bet.bet.status !== "skipped" && (
        <p className="mt-4 flex items-center gap-2 font-mono text-xs opacity-80">
          <Wallet className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span>
            auto-bet placed
            <span className="opacity-60"> · </span>
            ${bet.bet.amount_usdc.toFixed(2)} USDC
            <span className="opacity-60"> · </span>
            {outcomeLabel(bet.bet.outcome_index, bullOutcome, bearOutcome)} #{bet.bet.outcome_index}
            <span className="opacity-60"> · </span>
            <span
              className={cn(
                "font-bold",
                bet.bet.status === "placed"
                  ? "text-emerald-400 dark:text-emerald-600"
                  : "text-rose-400 dark:text-rose-600",
              )}
            >
              {bet.bet.status === "placed" ? "confirmed" : "failed"}
            </span>
          </span>
        </p>
      )}
    </motion.section>
  );
}
