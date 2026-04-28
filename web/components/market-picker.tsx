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
    <section className="rounded-xl border border-black bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wider text-gray-600">
          market
        </h2>
        <span className="font-mono text-[10px] text-gray-500">
          delphi mainnet
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={disabled || starting}
            className={cn(
              "w-full rounded-md border border-black bg-white px-3 py-2",
              "font-mono text-sm text-black",
              "focus:outline-none focus:ring-2 focus:ring-black",
              "disabled:cursor-not-allowed disabled:opacity-50",
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
                "w-full rounded-md border border-black bg-white px-3 py-2",
                "font-mono text-sm text-black placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-black",
              )}
            />
          )}

          {!isCustom && (
            <p className="font-mono text-[11px] text-gray-500">
              {DEMO_MARKETS.find((m) => m.id === selected)?.id ?? ""}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 self-start rounded-md",
            "border border-black bg-black px-5 font-mono text-sm font-medium",
            "text-white transition",
            "hover:bg-white hover:text-black",
            "disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400",
          )}
        >
          {starting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              starting…
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              start duel
            </>
          )}
        </button>
      </div>
    </section>
  );
}
