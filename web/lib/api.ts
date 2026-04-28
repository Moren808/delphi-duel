/**
 * Tiny client-side fetch helpers for our own /api/* routes.
 * Centralises error handling so components stay focused on UI.
 */

import type { MeshStatus, TurnRecord } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${url} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function fetchMeshStatus(): Promise<MeshStatus> {
  return getJson<MeshStatus>("/api/mesh-status");
}

export async function fetchTranscript(duelId: string): Promise<TurnRecord[]> {
  const data = await getJson<{ duel_id: string; turns: TurnRecord[] }>(
    `/api/transcript?duel_id=${encodeURIComponent(duelId)}`,
  );
  return data.turns;
}

export async function startDuel(marketId: string): Promise<{ duel_id: string; market_id: string; started_at: string }> {
  const res = await fetch("/api/start-duel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ market_id: marketId }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg = (json.error as string) ?? `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return json as { duel_id: string; market_id: string; started_at: string };
}

export async function fetchActiveDuel(): Promise<{
  duel_id: string;
  market_id: string;
  started_at: string;
  alive: boolean;
} | null> {
  const data = await getJson<{ active: { duel_id: string; market_id: string; started_at: string; alive: boolean } | null }>(
    "/api/start-duel",
  );
  return data.active;
}
