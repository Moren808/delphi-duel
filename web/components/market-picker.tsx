"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Loader2, RefreshCw } from "lucide-react";
import { DEMO_MARKETS } from "@/lib/markets";
import { fetchAllMarkets } from "@/lib/api";
import { classifyMarket, type PillCategory } from "@/lib/category-classifier";
import { cn } from "@/lib/cn";
import type { MarketSummary } from "@/lib/types";

/** Lightweight shape of /api/market/:id response — only the fields we use. */
interface LiveMarket {
  id: string;
  market_type: "binary" | "multi_outcome";
  outcomes_list: Array<{ name: string; probability: number }>;
}

/**
 * Common picker shape — every input source (live `/api/markets`,
 * fallback `demo-markets.json`, manually-pasted ID) collapses into
 * this. The classifier runs once per market so the pill filter
 * doesn't have to re-classify on every keystroke.
 */
interface PickerMarket {
  id: string;
  question: string;
  pill: PillCategory;
}

interface MarketPickerProps {
  /** Multi-outcome markets pass bull_outcome / bear_outcome along; binary markets omit. */
  onStart: (
    marketId: string,
    extras?: { bull_outcome?: string; bear_outcome?: string },
  ) => Promise<void>;
  /** Fires whenever the dropdown selection or custom-id changes. */
  onSelectionChange?: (marketId: string) => void;
  disabled?: boolean;
  starting?: boolean;
  initialMarketId?: string;
}

const CUSTOM_VALUE = "__custom__";

const PILLS: PillCategory[] = ["All", "Crypto", "Sports", "AI/Tech", "Politics", "Misc"];

const PILL_ORDER_FOR_OPTGROUP: PillCategory[] = [
  "Crypto",
  "Sports",
  "Politics",
  "AI/Tech",
  "Misc",
];

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function summaryToPicker(m: MarketSummary): PickerMarket {
  return {
    id: m.id,
    question: m.question,
    pill: classifyMarket(m.category, m.question),
  };
}

function demoToPicker(m: { id: string; question?: string; category?: string }): PickerMarket {
  const q = m.question ?? `(market ${m.id.slice(0, 12)}…)`;
  return { id: m.id, question: q, pill: classifyMarket(m.category, q) };
}

function groupByPill(markets: PickerMarket[]): Map<PillCategory, PickerMarket[]> {
  const groups = new Map<PillCategory, PickerMarket[]>();
  for (const m of markets) {
    if (!groups.has(m.pill)) groups.set(m.pill, []);
    groups.get(m.pill)!.push(m);
  }
  // Re-key in canonical order, then append unknown buckets (defensive).
  const ordered = new Map<PillCategory, PickerMarket[]>();
  for (const pill of PILL_ORDER_FOR_OPTGROUP) {
    if (groups.has(pill)) ordered.set(pill, groups.get(pill)!);
  }
  for (const [pill, list] of groups) {
    if (!ordered.has(pill)) ordered.set(pill, list);
  }
  return ordered;
}

export function MarketPicker({
  onStart,
  onSelectionChange,
  disabled = false,
  starting = false,
  initialMarketId,
}: MarketPickerProps) {
  /* ───────────────────── live market list state ───────────────────── */

  // Initial paint: show whatever's in the bundled demo-markets.json so
  // the dropdown isn't empty during the live fetch. Once the live
  // fetch resolves we replace; on failure we keep the fallback.
  const fallbackList = useMemo<PickerMarket[]>(
    () => DEMO_MARKETS.map(demoToPicker),
    [],
  );
  const [marketsList, setMarketsList] = useState<PickerMarket[]>(fallbackList);
  const [marketsLoading, setMarketsLoading] = useState<boolean>(true);
  const [marketsSource, setMarketsSource] = useState<"live" | "fallback">("fallback");
  const [marketsError, setMarketsError] = useState<string | null>(null);

  const loadMarkets = useCallback(async (force = false) => {
    setMarketsLoading(true);
    setMarketsError(null);
    try {
      const live = await fetchAllMarkets(force);
      setMarketsList(live.map(summaryToPicker));
      setMarketsSource("live");
    } catch (err) {
      // 503 (no API key in demo deploy), 502 (Delphi flaky), network — all
      // fall through to the bundled fallback.
      setMarketsList(fallbackList);
      setMarketsSource("fallback");
      setMarketsError((err as Error).message ?? "fetch failed");
    } finally {
      setMarketsLoading(false);
    }
  }, [fallbackList]);

  // Initial load on mount.
  useEffect(() => {
    void loadMarkets(false);
  }, [loadMarkets]);

  /* ───────────────────── selection state ───────────────────── */

  const [selected, setSelected] = useState<string>(initialMarketId ?? "");
  const [custom, setCustom] = useState<string>("");
  const [activePill, setActivePill] = useState<PillCategory>("All");

  // Once the markets list lands, snap the selection to a sensible default
  // if we don't already have a valid one in view.
  useEffect(() => {
    if (selected === CUSTOM_VALUE) return;
    if (marketsList.length === 0) return;
    const stillVisible = marketsList.some((m) => m.id === selected);
    if (!stillVisible) {
      // Try the initial requested ID first, then fall back to the head of the list.
      const initial = initialMarketId && marketsList.some((m) => m.id === initialMarketId)
        ? initialMarketId
        : marketsList[0].id;
      setSelected(initial);
    }
  }, [marketsList, selected, initialMarketId]);

  // Live market metadata for the selected market — drives the
  // outcome picker for multi-outcome markets.
  const [liveMarket, setLiveMarket] = useState<LiveMarket | null>(null);
  const [bullOutcome, setBullOutcome] = useState<string>("");
  const [bearOutcome, setBearOutcome] = useState<string>("");

  /* ───────────────────── filter + group ───────────────────── */

  const filteredGroups = useMemo(() => {
    const filtered =
      activePill === "All"
        ? marketsList
        : marketsList.filter((m) => m.pill === activePill);
    return groupByPill(filtered);
  }, [activePill, marketsList]);

  const flatFiltered = useMemo(
    () => Array.from(filteredGroups.values()).flat(),
    [filteredGroups],
  );

  // If the current selection isn't visible under the active pill,
  // snap to the first visible market.
  useEffect(() => {
    if (selected === CUSTOM_VALUE) return;
    if (flatFiltered.length === 0) return;
    const visible = flatFiltered.some((m) => m.id === selected);
    if (!visible) setSelected(flatFiltered[0].id);
  }, [activePill, flatFiltered, selected]);

  /* ───────────────────── derived ───────────────────── */

  const isCustom = selected === CUSTOM_VALUE;
  const marketId = isCustom ? custom.trim() : selected;
  const canStart = !disabled && !starting && marketId.length > 0;

  // Bubble selection changes up to the page so it can render context
  // panels (e.g. MarketSummaryCard).
  useEffect(() => {
    if (marketId.length > 0) onSelectionChange?.(marketId);
  }, [marketId, onSelectionChange]);

  // Hydrate per-market metadata for the multi-outcome detector.
  useEffect(() => {
    if (!marketId || marketId.length < 4) {
      setLiveMarket(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/market/${marketId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { market?: LiveMarket } | null) => {
        if (cancelled) return;
        const m = data?.market ?? null;
        setLiveMarket(m);
        if (m && m.market_type === "multi_outcome" && m.outcomes_list?.length >= 2) {
          const sorted = [...m.outcomes_list].sort(
            (a, b) => b.probability - a.probability,
          );
          setBullOutcome(sorted[0].name);
          setBearOutcome(sorted[1].name);
        } else {
          setBullOutcome("");
          setBearOutcome("");
        }
      })
      .catch(() => {
        /* silent — picker still works for binary markets */
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  const isMulti = liveMarket?.market_type === "multi_outcome";

  const handleStart = async () => {
    if (!canStart) return;
    if (isMulti && bullOutcome && bearOutcome) {
      if (bullOutcome === bearOutcome) return;
      await onStart(marketId, { bull_outcome: bullOutcome, bear_outcome: bearOutcome });
    } else {
      await onStart(marketId);
    }
  };

  const startDisabled =
    !canStart || (isMulti && (!bullOutcome || !bearOutcome || bullOutcome === bearOutcome));

  /* ───────────────────── render ───────────────────── */

  return (
    <section className="rounded-2xl border border-ink bg-white p-6 dark:border-stone-100 dark:bg-stone-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-mono text-sm uppercase tracking-wider text-ink dark:text-stone-100">
          market
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink-muted dark:text-stone-400">
            {marketsLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                fetching live markets…
              </span>
            ) : marketsSource === "live" ? (
              <>delphi mainnet · {marketsList.length} live</>
            ) : (
              <>
                fallback · bundled set
                {marketsError ? (
                  <span className="ml-1 text-rose-500" title={marketsError}>(live unavailable)</span>
                ) : null}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => loadMarkets(true)}
            disabled={marketsLoading || disabled || starting}
            title="Refresh markets"
            aria-label="Refresh markets"
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full",
              "border-2 border-ink text-ink transition",
              "hover:bg-ink hover:text-cream",
              "dark:border-stone-100 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-950",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink dark:disabled:hover:bg-transparent dark:disabled:hover:text-stone-100",
            )}
          >
            <RefreshCw className={cn("h-4 w-4", marketsLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filter pills: clicking narrows the dropdown to one category. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PILLS.map((pill) => {
          const active = pill === activePill;
          return (
            <button
              key={pill}
              type="button"
              onClick={() => setActivePill(pill)}
              disabled={disabled || starting}
              className={cn(
                "rounded-full border-2 px-4 py-1.5 font-mono text-sm font-medium transition",
                active
                  ? "border-ink bg-ink text-cream dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950"
                  : "border-ink/40 bg-transparent text-ink hover:border-ink hover:bg-ink/5 dark:border-stone-100/40 dark:text-stone-100 dark:hover:border-stone-100 dark:hover:bg-stone-100/10",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {pill}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={disabled || starting || marketsLoading}
            className={cn(
              "w-full rounded-xl border border-ink bg-cream px-4 py-3",
              "text-base text-ink",
              "focus:outline-none focus:ring-2 focus:ring-ink",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "dark:border-stone-100 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-stone-100",
            )}
          >
            {flatFiltered.length === 0 && !marketsLoading && (
              <option value="" disabled>
                no markets in this category
              </option>
            )}
            {Array.from(filteredGroups.entries()).map(([pill, markets]) => (
              <optgroup key={pill} label={pill}>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.question}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={CUSTOM_VALUE}>— paste market ID manually —</option>
          </select>

          {isCustom && (
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="0x..."
              disabled={disabled || starting}
              spellCheck={false}
              className={cn(
                "w-full rounded-xl border border-ink bg-cream px-4 py-3",
                "font-mono text-base text-ink placeholder:text-ink-muted",
                "focus:outline-none focus:ring-2 focus:ring-ink",
                "dark:border-stone-100 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:ring-stone-100",
              )}
            />
          )}

          {!isCustom && marketId && (
            <p className="font-mono text-xs text-ink-muted dark:text-stone-400">
              {marketId}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleStart}
          disabled={startDisabled}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 self-start rounded-xl px-6",
            "border-2 border-emerald-500 bg-emerald-500 text-base font-semibold text-white transition",
            "hover:bg-emerald-600 hover:border-emerald-600",
            "disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-400",
            "dark:disabled:border-stone-700 dark:disabled:bg-stone-800 dark:disabled:text-stone-500",
          )}
        >
          {starting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              starting…
            </>
          ) : (
            <>
              <Play className="h-5 w-5 fill-current" />
              start duel
            </>
          )}
        </button>
      </div>

      {/* Multi-outcome only — pick two outcomes for head-to-head debate. */}
      {isMulti && liveMarket && (
        <div className="mt-4 grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Bull argues
            </label>
            <select
              value={bullOutcome}
              onChange={(e) => setBullOutcome(e.target.value)}
              disabled={disabled || starting}
              className={cn(
                "w-full rounded-xl border-2 border-emerald-500 bg-cream px-4 py-2.5",
                "text-base text-ink",
                "focus:outline-none focus:ring-2 focus:ring-emerald-500",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "dark:bg-stone-950 dark:text-stone-100",
              )}
            >
              {liveMarket.outcomes_list.map((o) => (
                <option key={o.name} value={o.name} disabled={o.name === bearOutcome}>
                  {o.name} ({fmtPct(o.probability)})
                </option>
              ))}
            </select>
          </div>

          <div className="self-center pb-1 text-center">
            <span className="font-mono text-base font-bold tracking-widest text-ink dark:text-stone-100">
              VS
            </span>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Bear argues
            </label>
            <select
              value={bearOutcome}
              onChange={(e) => setBearOutcome(e.target.value)}
              disabled={disabled || starting}
              className={cn(
                "w-full rounded-xl border-2 border-rose-500 bg-cream px-4 py-2.5",
                "text-base text-ink",
                "focus:outline-none focus:ring-2 focus:ring-rose-500",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "dark:bg-stone-950 dark:text-stone-100",
              )}
            >
              {liveMarket.outcomes_list.map((o) => (
                <option key={o.name} value={o.name} disabled={o.name === bullOutcome}>
                  {o.name} ({fmtPct(o.probability)})
                </option>
              ))}
            </select>
          </div>

          {bullOutcome && bullOutcome === bearOutcome && (
            <p className="md:col-span-3 font-mono text-xs text-rose-600 dark:text-rose-400">
              pick two different outcomes
            </p>
          )}
        </div>
      )}
    </section>
  );
}
