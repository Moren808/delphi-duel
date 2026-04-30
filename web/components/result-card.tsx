"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { TurnRecord } from "@/lib/types";

interface Props {
  turns: TurnRecord[];
  marketQuestion: string;
  marketId: string;
}

interface VerdictResult {
  text: string;
  tone: "agree" | "disagree";
}

function computeVerdict(
  bullOpen: number,
  bullFinal: number,
  bearOpen: number,
  bearFinal: number,
  bullOutcome: string | null,
  bearOutcome: string | null,
): VerdictResult {
  const gap = Math.abs(bullFinal - bearFinal);
  const meanFinal = (bullFinal + bearFinal) / 2;
  const isOutcomeMode = Boolean(bullOutcome && bearOutcome);

  if (gap < 0.15) {
    if (isOutcomeMode) {
      // In outcome mode the probabilities aren't mutually exclusive,
      // so "lean YES/NO" framing doesn't apply. Just describe the
      // shape of agreement.
      return {
        tone: "agree",
        text: `${bullOutcome} (${bullFinal.toFixed(2)}) and ${bearOutcome} (${bearFinal.toFixed(2)}) ended close — gap ${gap.toFixed(2)}, neither outcome decisively prevails`,
      };
    }
    if (meanFinal < 0.4) {
      return {
        tone: "agree",
        text: `both agents lean NO — gap is ${gap.toFixed(2)}, high agreement`,
      };
    }
    if (meanFinal > 0.6) {
      return {
        tone: "agree",
        text: `both agents lean YES — gap is ${gap.toFixed(2)}, high agreement`,
      };
    }
    return {
      tone: "agree",
      text: `agents converged near a coin flip (mean ${meanFinal.toFixed(2)}, gap ${gap.toFixed(2)})`,
    };
  }

  if (isOutcomeMode) {
    // Whichever side ended with higher probability for THEIR outcome
    // made the more compelling case — by their own admission.
    const winner =
      bullFinal > bearFinal
        ? `${bullOutcome} holds at ${bullFinal.toFixed(2)} — stronger case than ${bearOutcome} (${bearFinal.toFixed(2)})`
        : `${bearOutcome} holds at ${bearFinal.toFixed(2)} — stronger case than ${bullOutcome} (${bullFinal.toFixed(2)})`;
    return { tone: "disagree", text: `agents disagree — ${winner} (gap ${gap.toFixed(2)})` };
  }

  // Roles are fixed in binary mode: bull always argues YES, bear always
  // argues NO. Reporting "bull holds NO" is a category error even when
  // bullFinal drops below 0.5 — that just means bull's YES case
  // weakened, not that bull switched sides.
  return {
    tone: "disagree",
    text: `agents disagree — bull holds YES at ${bullFinal.toFixed(2)}, bear holds NO at ${bearFinal.toFixed(2)} (gap ${gap.toFixed(2)})`,
  };
}

function moveLabel(open: number, final: number): string {
  const delta = final - open;
  if (Math.abs(delta) < 0.005) return "±0.000";
  return (delta > 0 ? "+" : "") + delta.toFixed(3);
}

export function ResultCard({ turns, marketQuestion, marketId }: Props) {
  const bullTurns = turns.filter((t) => t.role === "bull");
  const bearTurns = turns.filter((t) => t.role === "bear");
  const bullOpen = bullTurns[0]?.probability;
  const bullFinal = bullTurns[bullTurns.length - 1]?.probability;
  const bearOpen = bearTurns[0]?.probability;
  const bearFinal = bearTurns[bearTurns.length - 1]?.probability;

  // Outcome-mode metadata is stamped on every turn — pull from the
  // first turn (it never changes within a duel).
  const firstTurn = turns[0];
  const bullOutcomeName = firstTurn?.bull_outcome ?? null;
  const bearOutcomeName = firstTurn?.bear_outcome ?? null;
  const isOutcomeMode = Boolean(bullOutcomeName && bearOutcomeName);
  const bullLabel = bullOutcomeName ?? "bull";
  const bearLabel = bearOutcomeName ?? "bear";

  if (
    bullOpen == null ||
    bullFinal == null ||
    bearOpen == null ||
    bearFinal == null
  ) {
    return null;
  }

  const bullMove = bullFinal - bullOpen;
  const bearMove = bearFinal - bearOpen;
  const biggerMover =
    Math.abs(bullMove) > Math.abs(bearMove)
      ? "bull"
      : Math.abs(bearMove) > Math.abs(bullMove)
        ? "bear"
        : null;
  const gap = bullFinal - bearFinal;
  const verdict = computeVerdict(
    bullOpen,
    bullFinal,
    bearOpen,
    bearFinal,
    bullOutcomeName,
    bearOutcomeName,
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border-2 border-ink bg-white p-7 dark:border-stone-100 dark:bg-stone-900"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          duel complete
        </p>
        <p className="font-mono text-xs text-ink-muted dark:text-stone-400">{marketId.slice(0, 12)}…</p>
      </div>

      <h3 className="mb-6 text-2xl font-bold tracking-tight text-ink dark:text-stone-100">{marketQuestion}</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RoleSummary
          role="bull"
          label={bullLabel}
          open={bullOpen}
          final={bullFinal}
          moveLabel={moveLabel(bullOpen, bullFinal)}
        />
        <RoleSummary
          role="bear"
          label={bearLabel}
          open={bearOpen}
          final={bearFinal}
          moveLabel={moveLabel(bearOpen, bearFinal)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 border-t border-ink/15 pt-5 dark:border-stone-100/15 md:grid-cols-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">
            who moved more
          </p>
          <p className="mt-1 font-mono text-base font-semibold text-ink dark:text-stone-100">
            {biggerMover == null
              ? "tied"
              : biggerMover === "bull"
                ? `${bullLabel} (+${Math.abs(bullMove).toFixed(3)})`
                : `${bearLabel} (${moveLabel(bearOpen, bearFinal)})`}
          </p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">
            final gap
          </p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-ink dark:text-stone-100">
            {gap.toFixed(3)}{" "}
            <span className="text-ink-muted dark:text-stone-400">
              ({bullLabel} − {bearLabel})
            </span>
          </p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">
            rounds
          </p>
          <p className="mt-1 font-mono text-base font-semibold text-ink dark:text-stone-100">
            {turns.length} ({bullTurns.length} {bullLabel}, {bearTurns.length} {bearLabel})
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-ink/15 bg-cream px-5 py-4 text-base text-ink dark:border-stone-100/15 dark:bg-stone-950 dark:text-stone-100">
        <p className="font-medium">{verdict.text}</p>
      </div>
    </motion.section>
  );
}

interface RoleSummaryProps {
  role: "bull" | "bear";
  /** Outcome name for multi-outcome markets; "bull"/"bear" otherwise. */
  label: string;
  open: number;
  final: number;
  moveLabel: string;
}

function RoleSummary({ role, label, open, final, moveLabel }: RoleSummaryProps) {
  const isBull = role === "bull";
  const Icon = isBull ? TrendingUp : TrendingDown;
  const accent = isBull
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  const border = isBull
    ? "border-emerald-500/40"
    : "border-rose-500/40";

  return (
    <div className={`rounded-xl border-2 ${border} bg-cream p-5 dark:bg-stone-950`}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${accent}`} strokeWidth={2.5} />
        <span className={`font-mono text-sm font-semibold uppercase tracking-wider ${accent}`}>
          {label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 font-mono text-base tabular-nums">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">open</p>
          <p className="text-ink dark:text-stone-100">{open.toFixed(3)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">final</p>
          <p className={`font-bold ${accent}`}>{final.toFixed(3)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted dark:text-stone-400">move</p>
          <p className="text-ink dark:text-stone-100">{moveLabel}</p>
        </div>
      </div>
    </div>
  );
}
