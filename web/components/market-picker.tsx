"use client";

import { useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { DEMO_MARKETS } from "@/lib/markets";
import { cn } from "@/lib/cn";

interface MarketPickerProps {
  onStart: (marketId: string) => Promise<void>;
  disabled?: boolean;
  starting?: boolean;
  initialMarketId?: string;
}

const CUSTOM_VALUE = "__custom__";

export function MarketPicker({
  onStart,
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

  const isCustom = selected === CUSTOM_VALUE;
  const marketId = isCustom ? custom.trim() : selected;
  const canStart = !disabled && !starting && marketId.length > 0;

  const handleStart = async () => {
    if (!canStart) return;
    await onStart(marketId);
  };

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
            {DEMO_MARKETS.map((m) => (
              <option key={m.id} value={m.id}>
                [{m.category}] {m.question ?? m.id}
              </option>
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
          disabled={!canStart}
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
    </section>
  );
}
