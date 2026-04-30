"use client";

import { useEffect, useState } from "react";
import { fetchMeshStatus } from "@/lib/api";
import type { MeshStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const POLL_MS = 5_000;

interface DotProps {
  label: string;
  up: boolean | undefined;
}

function Dot({ label, up }: DotProps) {
  // Green when up, gray when down (Delphi-style status pill).
  const color = up
    ? "bg-emerald-500"
    : "bg-stone-300 dark:bg-stone-600";
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span className="text-ink-muted dark:text-stone-400">{label}</span>
    </div>
  );
}

export function MeshStatusIndicator() {
  const [status, setStatus] = useState<MeshStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const s = await fetchMeshStatus();
        if (!mounted) return;
        setStatus(s);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError((e as Error).message);
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const peering =
    status?.detail?.bull?.peering === true && status?.detail?.bear?.peering === true;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border bg-white px-4 py-2 dark:bg-stone-900",
        // Green border + green text when peered (mirrors Delphi's "Balance" pill).
        peering
          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
          : "border-ink dark:border-stone-100",
      )}
    >
      <span
        className={cn(
          "font-mono text-[11px] uppercase tracking-wider",
          peering ? "text-emerald-600 dark:text-emerald-400" : "text-ink-muted dark:text-stone-400",
        )}
      >
        AXL mesh
      </span>
      <Dot label="bull :9002" up={status?.bull} />
      <Dot label="bear :9012" up={status?.bear} />
      {peering && (
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          peered
        </span>
      )}
      {error && <span className="text-[11px] text-rose-500">{error}</span>}
    </div>
  );
}
