"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { DEMO_MARKETS } from "@/lib/markets";
import { cn } from "@/lib/cn";
import type { DemoMarket } from "@/lib/types";

/** Lightweight shape of /api/market/:id response — only the fields we use. */
interface LiveMarket {
  id: string;
  market_type: "binary" | "multi_outcome";
  outcomes_list: Array<{ name: string; probability: number }>;
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

// Filter pills shown above the dropdown. The `cats` array maps a
// user-facing label onto one or more underlying Delphi categories
// (e.g. "AI/Tech" surfaces our culture-tagged gaming markets, which
// are the closest thing Delphi catalogues for that frame).
const PILLS: Array<{ label: string; cats: string[] }> = [
  { label: "All", cats: [] },
  { label: "Crypto", cats: ["crypto"] },
  { label: "Sports", cats: ["sports"] },
  { label: "AI/Tech", cats: ["culture"] },
  { label: "Politics", cats: ["politics"] },
  { label: "Misc", cats: ["miscellaneous"] },
];

// Order categories appear inside the dropdown's optgroups.
const CATEGORY_ORDER = ["crypto", "sports", "politics", "culture", "miscellaneous"];

function groupByCategory(markets: DemoMarket[]): Map<string, DemoMarket[]> {
  const groups = new Map<string, DemoMarket[]>();
  for (const m of markets) {
    const cat = m.category ?? "uncategorised";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(m);
  }
  // Re-key in CATEGORY_ORDER, then append any unknown buckets.
  const ordered = new Map<string, DemoMarket[]>();
  for (const cat of CATEGORY_ORDER) {
    if (groups.has(cat)) ordered.set(cat, groups.get(cat)!);
  }
  for (const [cat, list] of groups) {
    if (!ordered.has(cat)) ordered.set(cat, list);
  }
  return ordered;
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function MarketPicker({
  onStart,
  onSelectionChange,
  disabled = false,
  starting = false,
  initialMarketId,
}: MarketPickerProps) {
  const initial =
    initialMarketId && DEMO_MARKETS.some((m) => m.id === initialMarketId)
      ? initialMarketId
      : DEMO_MARKETS[0]?.id ?? "";
  const [selected, setSelected] = useState<string>(initial);
  const [custom, setCustom] = useState<string>(initialMarketId && !DEMO_MARKETS.some((m) => m.id === initialMarketId) ? initialMarketId : "");
  const [activePill, setActivePill] = useState<string>("All");

  // Live market metadata — fetched whenever the active marketId changes.
  // Used to detect binary vs multi-outcome and to render the outcomes
  // dropdowns with their implied probabilities.
  const [liveMarket, setLiveMarket] = useState<LiveMarket | null>(null);
  // User's outcome picks for multi-outcome markets. Defaults are seeded
  // when liveMarket lands (top probability for bull, second for bear).
  const [bullOutcome, setBullOutcome] = useState<string>("");
  const [bearOutcome, setBearOutcome] = useState<string>("");

  // Apply the active pill filter to the master list, then group by
  // category for optgroup rendering. Selecting "All" returns everything.
  const filteredGroups = useMemo(() => {
    const pill = PILLS.find((p) => p.label === activePill);
    const filtered =
      !pill || pill.cats.length === 0
        ? DEMO_MARKETS
        : DEMO_MARKETS.filter((m) => pill.cats.includes(m.category ?? ""));
    return groupByCategory(filtered);
  }, [activePill]);

  const flatFiltered = useMemo(
    () => Array.from(filteredGroups.values()).flat(),
    [filteredGroups],
  );

  // If the current selection isn't visible under the active pill,
  // snap to the first market in the filtered list.
  useEffect(() => {
    if (selected === CUSTOM_VALUE) return;
    const visible = flatFiltered.some((m) => m.id === selected);
    if (!visible && flatFiltered.length > 0) setSelected(flatFiltered[0].id);
  }, [activePill, flatFiltered, selected]);

  const isCustom = selected === CUSTOM_VALUE;
  const marketId = isCustom ? custom.trim() : selected;
  const canStart = !disabled && !starting && marketId.length > 0;

  // Bubble selection changes up to the page so it can render context
  // panels (e.g. MarketSummaryCard) keyed off the current selection.
  useEffect(() => {
    if (marketId.length > 0) onSelectionChange?.(marketId);
  }, [marketId, onSelectionChange]);

  // Fetch live market shape when the selection changes. On failure
  // (no API key in demo mode, etc.) we keep liveMarket null and the
  // outcome picker simply doesn't render — binary markets don't need
  // it anyway, and demo deployments mostly preview binary markets.
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
        // Seed defaults: top probability → bull, second → bear.
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
      if (bullOutcome === bearOutcome) {
        // No-op — buttons should be guarded but be defensive.
        return;
      }
      await onStart(marketId, { bull_outcome: bullOutcome, bear_outcome: bearOutcome });
    } else {
      await onStart(marketId);
    }
  };

  const startDisabled =
    !canStart || (isMulti && (!bullOutcome || !bearOutcome || bullOutcome === bearOutcome));

  return (
    <section className="rounded-2xl border border-ink bg-white p-6 dark:border-stone-100 dark:bg-stone-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-sm uppercase tracking-wider text-ink dark:text-stone-100">
          market
        </h2>
        <span className="font-mono text-xs text-ink-muted dark:text-stone-400">
          delphi mainnet
        </span>
      </div>

      {/* Filter pills: clicking narrows the dropdown to one category. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PILLS.map((pill) => {
          const active = pill.label === activePill;
          return (
            <button
              key={pill.label}
              type="button"
              onClick={() => setActivePill(pill.label)}
              disabled={disabled || starting}
              className={cn(
                "rounded-full border-2 px-4 py-1.5 font-mono text-sm font-medium transition",
                active
                  ? "border-ink bg-ink text-cream dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950"
                  : "border-ink/40 bg-transparent text-ink hover:border-ink hover:bg-ink/5 dark:border-stone-100/40 dark:text-stone-100 dark:hover:border-stone-100 dark:hover:bg-stone-100/10",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={disabled || starting}
            className={cn(
              "w-full rounded-xl border border-ink bg-cream px-4 py-3",
              "text-base text-ink",
              "focus:outline-none focus:ring-2 focus:ring-ink",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "dark:border-stone-100 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-stone-100",
            )}
          >
            {Array.from(filteredGroups.entries()).map(([cat, markets]) => (
              <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.question ?? m.id}
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

          {!isCustom && (
            <p className="font-mono text-xs text-ink-muted dark:text-stone-400">
              {DEMO_MARKETS.find((m) => m.id === selected)?.id ?? ""}
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
