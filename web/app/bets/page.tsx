"use client";

/**
 * /bets — historical track record across every duel.
 *
 * One row per bet (skipped rows are excluded by default). Joined with
 * the verdicts table so each row shows the verdict confidence captured
 * at the time of the bet — useful for sanity-checking the judge's
 * calibration over time.
 */
import { ArrowUpRight, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/header";
import { cn } from "@/lib/cn";
import type { BetRecord, BetStatus } from "@/lib/types";

interface HistoricalBet extends BetRecord {
  confidence: number | null;
  recommended_position: string | null;
  winner: string | null;
}

interface ApiResponse {
  bets: HistoricalBet[];
  network: string;
}

function explorerTxUrl(network: string, txHash: string): string {
  const sub = network === "mainnet" ? "gensyn-mainnet" : "gensyn-testnet";
  return `https://${sub}.explorer.alchemy.com/tx/${txHash}`;
}

function outcomeLabel(idx: number): string {
  if (idx === 0) return "YES";
  if (idx === 1) return "NO";
  if (idx < 0) return "—";
  return `#${idx}`;
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const delta = (Date.now() - t) / 1_000;
  if (delta < 30) return "just now";
  if (delta < 3_600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}h ago`;
  if (delta < 604_800) return `${Math.floor(delta / 86_400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

function statusPill(status: BetStatus) {
  if (status === "placed") {
    return {
      label: "CONFIRMED",
      cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40 dark:text-emerald-400",
    };
  }
  if (status === "failed") {
    return {
      label: "FAILED",
      cls: "bg-rose-500/10 text-rose-700 border-rose-500/40 dark:text-rose-400",
    };
  }
  return {
    label: "SKIPPED",
    cls: "bg-stone-500/10 text-stone-700 border-stone-500/40 dark:text-stone-400",
  };
}

export default function BetsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/bets", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as ApiResponse;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    if (!data) return null;
    const placed = data.bets.filter((b) => b.status === "placed");
    const failed = data.bets.filter((b) => b.status === "failed");
    const totalUsdc = placed.reduce((sum, b) => sum + b.amount_usdc, 0);
    return { count: data.bets.length, placed: placed.length, failed: failed.length, totalUsdc };
  }, [data]);

  return (
    <main className="min-h-screen pb-20">
      <Header />

      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        {/* Page nav */}
        <nav className="flex items-center gap-4 font-mono text-sm">
          <Link
            href="/"
            className="text-ink-muted underline-offset-2 hover:underline dark:text-stone-400"
          >
            ← duels
          </Link>
          <span className="font-bold text-ink dark:text-stone-100">bets</span>
        </nav>

        {/* Title + totals */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-stone-400">
              track record
            </p>
            <h1 className="font-mono text-3xl font-bold text-ink dark:text-stone-100">
              all bets
            </h1>
          </div>
          {totals && (
            <div className="flex gap-6 font-mono text-xs">
              <div>
                <p className="text-ink-muted dark:text-stone-400">total</p>
                <p className="text-lg font-bold tabular-nums text-ink dark:text-stone-100">
                  {totals.count}
                </p>
              </div>
              <div>
                <p className="text-ink-muted dark:text-stone-400">confirmed</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {totals.placed}
                </p>
              </div>
              <div>
                <p className="text-ink-muted dark:text-stone-400">failed</p>
                <p className="text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
                  {totals.failed}
                </p>
              </div>
              <div>
                <p className="text-ink-muted dark:text-stone-400">USDC at risk</p>
                <p className="text-lg font-bold tabular-nums text-ink dark:text-stone-100">
                  ${totals.totalUsdc.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border-2 border-rose-500 bg-rose-50 px-5 py-4 font-mono text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-ink/30 bg-white/50 px-5 py-10 dark:border-stone-100/30 dark:bg-stone-900/50">
            <Loader2 className="h-4 w-4 animate-spin text-ink-muted dark:text-stone-400" />
            <p className="font-mono text-sm text-ink-muted dark:text-stone-400">
              loading bets…
            </p>
          </div>
        )}

        {data && data.bets.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-ink/30 bg-white/50 px-5 py-16 text-center dark:border-stone-100/30 dark:bg-stone-900/50">
            <p className="font-mono text-sm text-ink-muted dark:text-stone-400">
              no bets yet — run a duel with AUTO_BET on
            </p>
          </div>
        )}

        {data && data.bets.length > 0 && (
          <div className="overflow-x-auto rounded-xl border-2 border-ink dark:border-stone-100">
            <table className="w-full border-collapse text-left font-mono text-sm">
              <thead className="bg-stone-100 dark:bg-stone-800">
                <tr className="text-[10px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
                  <th className="px-3 py-2">when</th>
                  <th className="px-3 py-2">market</th>
                  <th className="px-3 py-2">outcome</th>
                  <th className="px-3 py-2 text-right">amount</th>
                  <th className="px-3 py-2 text-right">conf</th>
                  <th className="px-3 py-2">tx</th>
                  <th className="px-3 py-2">status</th>
                </tr>
              </thead>
              <tbody>
                {data.bets.map((b) => {
                  const pill = statusPill(b.status);
                  return (
                    <tr
                      key={b.duel_id + b.timestamp}
                      className="border-t border-ink/10 dark:border-stone-100/10"
                    >
                      <td
                        className="px-3 py-2 text-ink-muted dark:text-stone-400"
                        title={b.timestamp}
                      >
                        {relativeTime(b.timestamp)}
                      </td>
                      <td className="px-3 py-2 text-ink dark:text-stone-100">
                        {b.market_id.slice(0, 10)}…{b.market_id.slice(-4)}
                      </td>
                      <td className="px-3 py-2 font-bold text-ink dark:text-stone-100">
                        {outcomeLabel(b.outcome_index)}
                        {b.outcome_index >= 0 && (
                          <span className="ml-1 font-normal text-ink-muted dark:text-stone-400">
                            #{b.outcome_index}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink dark:text-stone-100">
                        ${b.amount_usdc.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted dark:text-stone-400">
                        {b.confidence != null ? `${(b.confidence * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {b.tx_hash ? (
                          <a
                            href={explorerTxUrl(data.network, b.tx_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
                            title={b.tx_hash}
                          >
                            {b.tx_hash.slice(0, 8)}…{b.tx_hash.slice(-4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-ink-muted dark:text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold",
                            pill.cls,
                          )}
                        >
                          {pill.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 font-mono text-[10px] text-ink-muted dark:text-stone-400">
          network: <span className="font-semibold">{data?.network ?? "—"}</span>
          <Link href="/" className="ml-3 inline-flex items-center gap-1 hover:underline">
            run a duel <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
      </div>
    </main>
  );
}
