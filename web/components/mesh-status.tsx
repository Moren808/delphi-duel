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
  // Black when peered/up; light gray when offline or unknown.
  const color = up ? "bg-black" : "bg-gray-300";
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span className="text-gray-700">{label}</span>
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
    <div className="flex items-center gap-4 rounded-lg border border-black bg-white px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
        AXL mesh
      </span>
      <Dot label="bull :9002" up={status?.bull} />
      <Dot label="bear :9012" up={status?.bear} />
      {peering && (
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-black">
          peered
        </span>
      )}
      {error && <span className="text-[10px] text-gray-500">{error}</span>}
    </div>
  );
}
