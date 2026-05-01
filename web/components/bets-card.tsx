"use client";

/**
 * BETS panel — renders below the judge verdict card when AUTO_BET=true
 * and the judge has reached the betting branch for this duel.
 *
 * Visibility rules:
 *   - Hidden entirely when AUTO_BET=false (server-controlled).
 *   - Hidden when the judge skipped the bet (low confidence, neutral
 *     position) — those rows are bookkeeping, not user-facing.
 *   - Renders a pending placeholder while the judge is mid-flight (no
 *     row yet but auto-bet is on).
 *   - Renders the placed/failed row once it lands in SQLite.
 */
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { fetchBet, type BetResponse } from "@/lib/api";
import { cn } from "@/lib/cn";

const POLL_MS = 1_500;

interface Props {
  duelId: string;
  /** When true, we know the duel is over — start polling for the bet row. */
  duelComplete: boolean;
  /** Multi-outcome head-to-head: if both set, used to label the outcome name. */
  bullOutcome?: string | null;
  bearOutcome?: string | null;
}

/** Build the Alchemy block-explorer tx link for the right network. */
function explorerTxUrl(network: string, txHash: string): string {
  const sub = network === "mainnet" ? "gensyn-mainnet" : "gensyn-testnet";
  return `https://${sub}.explorer.alchemy.com/tx/${txHash}`;
}

/**
 * Map an outcome index to a human label. For binary markets this is
 * "YES"/"NO"; for multi-outcome head-to-head we use the side names if
 * both bull and bear champions are known.
 */
function outcomeLabel(
  idx: number,
  bullOutcome?: string | null,
  bearOutcome?: string | null,
): string {
  // Multi-outcome head-to-head takes precedence — bull = idx0 side, bear = idx1.
  // The judge's decideBet() resolves to the actual market outcome index, but
  // for display we fall back to the role-side label here.
  if (bullOutcome && bearOutcome) {
    if (idx === 0) return bullOutcome.toUpperCase();
    if (idx === 1) return bearOutcome.toUpperCase();
    return `OUTCOME #${idx}`;
  }
  if (idx === 0) return "YES";
  if (idx === 1) return "NO";
  return `OUTCOME #${idx}`;
}

/** Tiny relative-time string — "just now", "2m ago", "1h ago", or ISO date. */
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const delta = (Date.now() - t) / 1_000;
  if (delta < 30) return "just now";
  if (delta < 3_600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}h ago`;
  return new Date(t).toISOString().slice(0, 16).replace("T", " ");
}

export function BetsCard({
  duelId,
  duelComplete,
  bullOutcome,
  bearOutcome,
}: Props) {
  const [resp, setResp] = useState<BetResponse | null>(null);

  useEffect(() => {
    if (!duelComplete) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await fetchBet(duelId);
        if (cancelled) return;
        setResp(r);
      } catch {
        /* non-fatal — retry */
      }
    };
    void tick();
    const id = setInterval(() => {
      // Stop polling once we have a terminal row (placed/failed). Keep
      // polling while the bet is null (judge still working) or skipped
      // (we hide it but the shape is final too — stop in that case).
      if (resp?.bet?.status === "placed" || resp?.bet?.status === "failed") {
        clearInterval(id);
        return;
      }
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [duelId, duelComplete, resp?.bet?.status]);

  // Don't render until the duel is complete, the API has answered, or
  // when AUTO_BET is off server-side. Skipped bets are also hidden —
  // those rows mean "judge decided NOT to bet" (neutral / low confidence
  // / AUTO_BET=false). The user only wants to see active positions.
  if (!duelComplete) return null;
  if (!resp) return null;
  if (!resp.auto_bet_enabled) return null;
  if (resp.bet?.status === "skipped") return null;

  const bet = resp.bet;
  const network = resp.network;

  // Pending placeholder — judge has produced a verdict, AUTO_BET is on,
  // but the bet row hasn't landed yet (placeBet in flight).
  if (!bet) {
    return (
      <section className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-6 dark:border-amber-500 dark:bg-amber-950/40">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              bets — pending
            </p>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
              Judge is submitting the on-chain transaction. Polling SQLite
              for the bet row.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // UI status mapping: DB `placed` → "confirmed" (the tx is on-chain,
  // included in a block); DB `failed` → "failed" (revert / insufficient
  // funds / etc.). `skipped` is handled above.
  const uiStatus: "confirmed" | "failed" =
    bet.status === "placed" ? "confirmed" : "failed";

  const StatusIcon = uiStatus === "confirmed" ? CheckCircle2 : AlertTriangle;
  const statusColor =
    uiStatus === "confirmed"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  const borderColor =
    uiStatus === "confirmed"
      ? "border-emerald-500/60 dark:border-emerald-400/60"
      : "border-rose-500/60 dark:border-rose-400/60";

  const outcome = outcomeLabel(bet.outcome_index, bullOutcome, bearOutcome);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "rounded-2xl border-2 bg-white p-6 dark:bg-stone-900",
        borderColor,
      )}
    >
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <Wallet className="h-5 w-5 text-ink dark:text-stone-100" strokeWidth={2.5} />
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-ink dark:text-stone-100">
          bets
          <span className="ml-2 rounded bg-stone-200 px-2 py-0.5 text-[10px] font-mono text-ink-muted dark:bg-stone-800 dark:text-stone-400">
            {network}
          </span>
        </p>
      </div>

      {/* Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Market */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            market
          </p>
          <p className="mt-1 font-mono text-sm text-ink dark:text-stone-100">
            {bet.market_id.slice(0, 10)}…{bet.market_id.slice(-4)}
          </p>
        </div>

        {/* Outcome */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            outcome
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-ink dark:text-stone-100">
            {outcome}
            <span className="ml-2 text-ink-muted dark:text-stone-400">
              #{bet.outcome_index}
            </span>
          </p>
        </div>

        {/* Amount */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            amount
          </p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-ink dark:text-stone-100">
            ${bet.amount_usdc.toFixed(2)} USDC
          </p>
        </div>

        {/* Tx hash */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            tx hash
          </p>
          {bet.tx_hash ? (
            <a
              href={explorerTxUrl(network, bet.tx_hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-sm text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
              title={bet.tx_hash}
            >
              {bet.tx_hash.slice(0, 8)}…{bet.tx_hash.slice(-6)}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <p className="mt-1 font-mono text-sm text-ink-muted dark:text-stone-400">
              —
            </p>
          )}
        </div>

        {/* Status */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            status
          </p>
          <div className={cn("mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-bold uppercase", statusColor)}>
            <StatusIcon className="h-4 w-4" strokeWidth={2.5} />
            {uiStatus}
          </div>
        </div>
      </div>

      {/* Footer: timestamp + error (when failed) */}
      <div className="mt-5 flex flex-col gap-2 border-t border-ink/10 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-stone-100/10">
        <p
          className="font-mono text-xs text-ink-muted dark:text-stone-400"
          title={bet.timestamp}
        >
          {relativeTime(bet.timestamp)}
        </p>
        {uiStatus === "failed" && bet.error && (
          <p className="font-mono text-xs text-rose-700 dark:text-rose-300">
            {bet.error.split("\n")[0].slice(0, 120)}
          </p>
        )}
      </div>
    </motion.section>
  );
}
