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
  const color = up == null ? "bg-slate-600" : up ? "bg-emerald-500" : "bg-rose-500";
  const ring = up == null ? "" : up ? "shadow-[0_0_8px_-1px_rgba(34,197,94,0.7)]" : "";
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className={cn("h-2.5 w-2.5 rounded-full", color, ring)} />
      <span className="text-slate-400">{label}</span>
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
    <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
        AXL mesh
      </span>
      <Dot label="bull :9002" up={status?.bull} />
      <Dot label="bear :9012" up={status?.bear} />
      {peering && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
          peered
        </span>
      )}
      {error && <span className="text-[10px] text-rose-400">{error}</span>}
    </div>
  );
}
