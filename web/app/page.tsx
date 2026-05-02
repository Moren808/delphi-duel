"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Sparkles } from "lucide-react";
import { Header } from "@/components/header";
import { MarketPicker } from "@/components/market-picker";
import { MarketSummaryCard } from "@/components/market-summary-card";
import { AgentArena } from "@/components/agent-arena";
import { TranscriptPane } from "@/components/transcript-pane";
import { AxlLog } from "@/components/axl-log";
import { ResultCard } from "@/components/result-card";
import { VerdictCard } from "@/components/verdict-card";
import { BetsCard } from "@/components/bets-card";
import {
  fetchActiveDuel,
  fetchTranscript,
  startDuel,
} from "@/lib/api";
import { DEMO_MARKETS } from "@/lib/markets";
import { cn } from "@/lib/cn";
import type { BetRecord, TurnRecord, VerdictRecord } from "@/lib/types";
import exampleDuelFixture from "../fixtures/example-duel.json";

const POLL_MS = 1_000;

// True when the deployment is meant to be a view-only demo (no AXL nodes,
// no agent processes, no orchestrator). Set NEXT_PUBLIC_DEMO_MODE=1 in
// Vercel env to enable.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

interface ExampleDuel {
  duel_id: string;
  market_id: string;
  market_question: string;
  market_category?: string;
  recorded_at?: string;
  turns: TurnRecord[];
  /** Optional — pre-baked judge verdict for the example replay. */
  verdict?: VerdictRecord;
  /**
   * Optional — pre-baked autonomous-bet row. When present the dashboard
   * renders the BetsCard + the inline summary on the verdict card so the
   * full closed-loop demo (debate → verdict → on-chain bet) is visible
   * on the Vercel deploy without a live judge.
   */
  bet?: BetRecord & { network?: string };
}

function lookupMarketQuestion(marketId: string): string {
  const m = DEMO_MARKETS.find((x) => x.id === marketId);
  return m?.question ?? `(market ${marketId.slice(0, 10)}…)`;
}

function isComplete(turns: TurnRecord[]): boolean {
  // Both agents have produced their is_final turn.
  return turns.filter((t) => t.is_final).length >= 2;
}

export default function Home() {
  const [duelId, setDuelId] = useState<string | null>(null);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // duelLive = a child orchestrator is running OR the transcript is
  // incomplete (still expecting more turns).
  const [duelLive, setDuelLive] = useState(false);
  // Set when the user clicks "view example duel" — disables polling and
  // suppresses the start button.
  const [viewingExample, setViewingExample] = useState(false);
  // Override for the title strip — fixture's market_question fallback.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  // Inline verdict override — set when replaying the example fixture
  // (fixture has a baked-in verdict so VerdictCard can render without
  // polling). Cleared on real duels (live polling via /api/verdict).
  const [inlineVerdict, setInlineVerdict] = useState<VerdictRecord | null>(null);
  // Inline bet override — same idea as inlineVerdict, for the autonomous
  // betting panel. Set only when replaying the example fixture.
  const [inlineBet, setInlineBet] = useState<(BetRecord & { network?: string }) | null>(null);
  // The market currently selected in the picker dropdown — drives the
  // MarketSummaryCard before any duel starts. Distinct from `marketId`,
  // which only flips after Start Duel is clicked.
  const [pendingMarketId, setPendingMarketId] = useState<string | null>(null);

  // Restore active duel on initial mount (page refresh during a duel).
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const active = await fetchActiveDuel();
        if (!mounted || !active) return;
        setDuelId(active.duel_id);
        setMarketId(active.market_id);
        setDuelLive(active.alive);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Polling loop: while we have a duelId, poll the transcript every
  // 1s. Stop once both finals have landed. Skip entirely when viewing
  // the example fixture (turns come from JSON, not the API).
  useEffect(() => {
    if (!duelId || viewingExample) return;

    let cancelled = false;
    let stopped = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const fresh = await fetchTranscript(duelId);
        if (cancelled) return;
        setTurns(fresh);
        if (isComplete(fresh)) {
          stopped = true;
          setDuelLive(false);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };

    void tick(); // immediate
    const id = setInterval(() => {
      if (stopped) {
        clearInterval(id);
        return;
      }
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [duelId, viewingExample]);

  const handleStart = useCallback(
    async (
      selectedMarketId: string,
      extras?: { bull_outcome?: string; bear_outcome?: string },
    ) => {
      if (starting) return;
      setStarting(true);
      setError(null);
      setTurns([]);
      setViewingExample(false);
      setTitleOverride(null);
      setInlineVerdict(null);
      setInlineBet(null);
      try {
        const r = await startDuel(selectedMarketId, extras);
        setDuelId(r.duel_id);
        setMarketId(r.market_id);
        setDuelLive(true);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setStarting(false);
      }
    },
    [starting],
  );

  const handleViewExample = useCallback(() => {
    const ex = exampleDuelFixture as ExampleDuel;
    setViewingExample(true);
    setError(null);
    setStarting(false);
    setDuelLive(false);
    setDuelId(ex.duel_id);
    setMarketId(ex.market_id);
    setTurns(ex.turns);
    setTitleOverride(ex.market_question);
    setInlineVerdict(ex.verdict ?? null);
    setInlineBet(ex.bet ?? null);
  }, []);

  const duelComplete = isComplete(turns);
  const marketQuestion = titleOverride
    ? titleOverride
    : marketId
      ? lookupMarketQuestion(marketId)
      : "";

  return (
    <main className="min-h-screen pb-20">
      <Header />

      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        {DEMO_MODE && (
          <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4 dark:border-amber-500 dark:bg-amber-950/40">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  demo mode
                </p>
                <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
                  This deployment shows the UI only. Real duels run locally
                  via the AXL mesh on your laptop. Click{" "}
                  <span className="font-semibold">view example duel</span>{" "}
                  below to see a recorded run.
                </p>
              </div>
            </div>
          </div>
        )}

        <MarketPicker
          onStart={handleStart}
          onSelectionChange={setPendingMarketId}
          disabled={duelLive || DEMO_MODE}
          starting={starting}
          initialMarketId={marketId ?? undefined}
        />

        {/* Show market context whenever something is selected and no
            duel is in flight. Hides during live polling, an ongoing
            example replay, or before the picker has settled. */}
        {pendingMarketId && !duelLive && !viewingExample && turns.length === 0 && (
          <MarketSummaryCard marketId={pendingMarketId} />
        )}

        <button
          type="button"
          onClick={handleViewExample}
          disabled={duelLive && !viewingExample}
          className={cn(
            "inline-flex items-center justify-center gap-2 self-start rounded-lg",
            "border-2 border-ink bg-white px-5 py-2.5 font-mono text-sm font-medium",
            "text-ink transition",
            "hover:bg-ink hover:text-cream",
            "dark:border-stone-100 dark:bg-stone-900 dark:text-stone-100",
            "dark:hover:bg-stone-100 dark:hover:text-stone-950",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-ink",
          )}
        >
          <History className="h-4 w-4" />
          {viewingExample ? "viewing example duel" : "view example duel"}
        </button>

        {error && (
          <div className="rounded-xl border-2 border-rose-500 bg-rose-50 px-5 py-4 font-mono text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        {marketId && (
          <>
            <div className="flex items-center justify-between rounded-2xl border border-ink bg-white px-5 py-4 dark:border-stone-100 dark:bg-stone-900">
              <p className="text-lg font-semibold text-ink dark:text-stone-100">{marketQuestion}</p>
              <p className="font-mono text-xs text-ink-muted dark:text-stone-400">
                {marketId.slice(0, 12)}…
              </p>
            </div>

            <AgentArena turns={turns} duelLive={duelLive} />

            {duelComplete && (
              <ResultCard
                turns={turns}
                marketQuestion={marketQuestion}
                marketId={marketId}
              />
            )}

            {duelComplete && duelId && (
              <VerdictCard
                duelId={duelId}
                duelComplete={duelComplete}
                inlineVerdict={inlineVerdict}
                inlineBet={inlineBet}
                inlineNetwork={inlineBet?.network}
                bullOutcome={turns[0]?.bull_outcome ?? null}
                bearOutcome={turns[0]?.bear_outcome ?? null}
              />
            )}

            {/* Render BetsCard for live duels OR for the example fixture
                when it carries a baked-in bet (Vercel demo). */}
            {duelComplete && duelId && (!viewingExample || inlineBet) && (
              <BetsCard
                duelId={duelId}
                duelComplete={duelComplete}
                inlineBet={inlineBet}
                inlineNetwork={inlineBet?.network}
                bullOutcome={turns[0]?.bull_outcome ?? null}
                bearOutcome={turns[0]?.bear_outcome ?? null}
              />
            )}

            <AxlLog turns={turns} />

            <TranscriptPane turns={turns} />
          </>
        )}

        {!marketId && (
          <div className="rounded-2xl border-2 border-dashed border-ink/30 bg-white/50 px-6 py-16 text-center dark:border-stone-100/30 dark:bg-stone-900/50">
            <p className="font-mono text-sm uppercase tracking-wider text-ink-muted dark:text-stone-400">
              ready
            </p>
            <p className="mt-3 text-lg text-ink-muted dark:text-stone-400">
              pick a market above and press <span className="font-semibold text-emerald-600 dark:text-emerald-400">start duel</span> to begin
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
