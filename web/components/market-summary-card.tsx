"use client";

import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { DEMO_MARKETS } from "@/lib/markets";
import type { DemoMarket } from "@/lib/types";

interface LiveMarket {
  id: string;
  prompt: string;
  outcomes: string[];
  implied_probabilities: number[];
  close_date: string;
  category?: string;
}

interface Props {
  marketId: string;
}

/**
 * Shown when a market is selected but no duel has started. Provides
 * context: the demo_pitch paragraph from demo-markets.json, the live
 * implied probability for the champion outcome (fetched via /api/market),
 * and a "why it matters" framing.
 *
 * If live fetch fails (no DELPHI_API_ACCESS_KEY in demo deployments),
 * the static demo_pitch alone still renders — the live probability
 * row simply hides.
 */
export function MarketSummaryCard({ marketId }: Props) {
  const demo: DemoMarket | undefined = DEMO_MARKETS.find((m) => m.id === marketId);
  const [live, setLive] = useState<LiveMarket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLive(null);
    fetch(`/api/market/${marketId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { market?: LiveMarket } | null) => {
        if (!mounted) return;
        if (data?.market) setLive(data.market);
      })
      .catch(() => { /* silent — fallback to static text */ })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [marketId]);

  // Pick the champion outcome's implied probability (index 0, matching
  // the orchestrator default). For binary markets this is the YES probability.
  const championOutcome = live?.outcomes?.[0] ?? demo?.outcomes?.[0] ?? "Yes";
  const championProb = live?.implied_probabilities?.[0];
  const isBinary = (live?.outcomes?.length ?? demo?.outcomes?.length ?? 2) === 2;

  const closeDate = live?.close_date ?? demo?.resolves_at;
  const daysToClose = closeDate
    ? Math.max(
        0,
        Math.round(
          (new Date(closeDate).getTime() - Date.now()) / 86_400_000,
        ),
      )
    : null;

  if (!demo && !live) return null;

  const question = demo?.question ?? live?.prompt?.split("\n")[0] ?? "";
  const pitch = demo?.demo_pitch;
  const category = demo?.category ?? live?.category;

  return (
    <section className="rounded-2xl border border-ink bg-white p-6 dark:border-stone-100 dark:bg-stone-900">
      <div className="mb-4 flex items-start gap-3">
        <Info className="mt-1 h-5 w-5 shrink-0 text-ink-muted dark:text-stone-400" />
        <div className="flex-1">
          <p className="font-mono text-sm font-semibold uppercase tracking-wider text-ink dark:text-stone-100">
            Market Summary
          </p>
          <p className="text-sm text-ink-muted dark:text-stone-400">
            context for the duel — what's at stake and why it matters
          </p>
        </div>
        {category && (
          <span className="rounded-full border border-ink/30 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-ink dark:border-stone-100/30 dark:text-stone-100">
            {category}
          </span>
        )}
      </div>

      <h3 className="mb-3 text-xl font-semibold text-ink dark:text-stone-100">
        {question}
      </h3>

      {pitch && (
        <p className="mb-5 text-base leading-relaxed text-ink-muted dark:text-stone-300">
          {pitch}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-ink/15 pt-4 sm:grid-cols-3 dark:border-stone-100/15">
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            implied P({isBinary ? "YES" : championOutcome})
          </dt>
          <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink dark:text-stone-100">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-ink-muted dark:text-stone-400" />
            ) : championProb != null ? (
              `${(championProb * 100).toFixed(1)}%`
            ) : (
              <span className="text-base font-normal text-ink-muted dark:text-stone-400">
                live data unavailable
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            resolves in
          </dt>
          <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink dark:text-stone-100">
            {daysToClose != null ? (
              <>
                {daysToClose}
                <span className="ml-1 text-base font-normal text-ink-muted dark:text-stone-400">
                  days
                </span>
              </>
            ) : (
              <span className="text-base font-normal text-ink-muted dark:text-stone-400">
                —
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:text-stone-400">
            outcomes
          </dt>
          <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink dark:text-stone-100">
            {live?.outcomes?.length ?? demo?.outcomes?.length ?? "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
