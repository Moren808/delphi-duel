"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/header";
import { MarketPicker } from "@/components/market-picker";
import { AgentArena } from "@/components/agent-arena";
import { TranscriptPane } from "@/components/transcript-pane";
import { AxlLog } from "@/components/axl-log";
import { ResultCard } from "@/components/result-card";
import {
  fetchActiveDuel,
  fetchTranscript,
  startDuel,
} from "@/lib/api";
import { DEMO_MARKETS } from "@/lib/markets";
import type { TurnRecord } from "@/lib/types";

const POLL_MS = 1_000;

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
  // 1s. Stop once both finals have landed.
  useEffect(() => {
    if (!duelId) return;

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
  }, [duelId]);

  const handleStart = useCallback(
    async (selectedMarketId: string) => {
      if (starting) return;
      setStarting(true);
      setError(null);
      setTurns([]);
      try {
        const r = await startDuel(selectedMarketId);
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

  const duelComplete = isComplete(turns);
  const marketQuestion = marketId ? lookupMarketQuestion(marketId) : "";

  return (
    <main className="min-h-screen pb-20">
      <Header />

      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <MarketPicker
          onStart={handleStart}
          disabled={duelLive}
          starting={starting}
          initialMarketId={marketId ?? undefined}
        />

        {error && (
          <div className="rounded-lg border-2 border-black bg-white px-4 py-3 font-mono text-xs text-black">
            {error}
          </div>
        )}

        {marketId && (
          <>
            <div className="flex items-center justify-between rounded-lg border border-black bg-white px-4 py-3">
              <p className="text-sm text-black">{marketQuestion}</p>
              <p className="font-mono text-[10px] text-gray-500">
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

            <AxlLog turns={turns} />

            <TranscriptPane turns={turns} />
          </>
        )}

        {!marketId && (
          <div className="rounded-xl border border-dashed border-black bg-white px-6 py-12 text-center">
            <p className="font-mono text-xs uppercase tracking-wider text-gray-600">
              ready
            </p>
            <p className="mt-2 text-sm text-gray-700">
              pick a market above and press <span className="font-semibold text-black">start duel</span> to begin
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
