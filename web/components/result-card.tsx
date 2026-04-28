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
): VerdictResult {
  const gap = Math.abs(bullFinal - bearFinal);
  const meanFinal = (bullFinal + bearFinal) / 2;
  if (gap < 0.15) {
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
  return {
    tone: "disagree",
    text: `agents disagree — bull holds ${bullFinal >= 0.5 ? "YES" : "NO"} at ${bullFinal.toFixed(2)}, bear at ${bearFinal.toFixed(2)} (gap ${gap.toFixed(2)})`,
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
  const verdict = computeVerdict(bullOpen, bullFinal, bearOpen, bearFinal);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl border-2 border-black bg-white p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-black">
          duel complete
        </p>
        <p className="font-mono text-[10px] text-gray-500">{marketId.slice(0, 12)}…</p>
      </div>

      <h3 className="mb-5 text-lg font-semibold text-black">{marketQuestion}</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RoleSummary
          role="bull"
          open={bullOpen}
          final={bullFinal}
          moveLabel={moveLabel(bullOpen, bullFinal)}
        />
        <RoleSummary
          role="bear"
          open={bearOpen}
          final={bearFinal}
          moveLabel={moveLabel(bearOpen, bearFinal)}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-black pt-4 md:grid-cols-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
            who moved more
          </p>
          <p className="mt-1 font-mono text-sm text-black">
            {biggerMover == null
              ? "tied"
              : biggerMover === "bull"
                ? `bull (+${Math.abs(bullMove).toFixed(3)})`
                : `bear (${moveLabel(bearOpen, bearFinal)})`}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
            final gap
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums text-black">
            {gap.toFixed(3)}{" "}
            <span className="text-gray-500">(bull − bear)</span>
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
            rounds
          </p>
          <p className="mt-1 font-mono text-sm text-black">
            {turns.length} ({bullTurns.length} bull, {bearTurns.length} bear)
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-black bg-white px-4 py-3 text-sm text-black">
        <p className="font-medium">{verdict.text}</p>
      </div>
    </motion.section>
  );
}

interface RoleSummaryProps {
  role: "bull" | "bear";
  open: number;
  final: number;
  moveLabel: string;
}

function RoleSummary({ role, open, final, moveLabel }: RoleSummaryProps) {
  const Icon = role === "bull" ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-lg border border-black bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-black" strokeWidth={2.5} />
        <span className="font-mono text-xs font-semibold uppercase text-black">
          {role}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-sm tabular-nums">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">open</p>
          <p className="text-black">{open.toFixed(3)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">final</p>
          <p className="font-semibold text-black">{final.toFixed(3)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">move</p>
          <p className="text-black">{moveLabel}</p>
        </div>
      </div>
    </div>
  );
}
