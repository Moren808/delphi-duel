/**
 * Tiny client-side fetch helpers for our own /api/* routes.
 * Centralises error handling so components stay focused on UI.
 */

import type { BetRecord, MarketSummary, MeshStatus, TurnRecord, VerdictRecord } from "./types";

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

/**
 * Pull all open Delphi mainnet markets via /api/markets. Pass
 * `force: true` to bypass the route's 30s cache.
 */
export async function fetchAllMarkets(
  force = false,
): Promise<MarketSummary[]> {
  const data = await getJson<{ markets: MarketSummary[]; cached: boolean; fetched_at: string }>(
    `/api/markets${force ? "?refresh=1" : ""}`,
  );
  return data.markets;
}

export async function fetchTranscript(duelId: string): Promise<TurnRecord[]> {
  const data = await getJson<{ duel_id: string; turns: TurnRecord[] }>(
    `/api/transcript?duel_id=${encodeURIComponent(duelId)}`,
  );
  return data.turns;
}

export async function fetchVerdict(duelId: string): Promise<VerdictRecord | null> {
  const data = await getJson<{ duel_id: string; verdict: VerdictRecord | null }>(
    `/api/verdict?duel_id=${encodeURIComponent(duelId)}`,
  );
  return data.verdict;
}

export async function startDuel(
  marketId: string,
  extras?: { bull_outcome?: string; bear_outcome?: string },
): Promise<{ duel_id: string; market_id: string; started_at: string }> {
  const body: Record<string, unknown> = { market_id: marketId };
  if (extras?.bull_outcome) body.bull_outcome = extras.bull_outcome;
  if (extras?.bear_outcome) body.bear_outcome = extras.bear_outcome;
  const res = await fetch("/api/start-duel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg = (json.error as string) ?? `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return json as { duel_id: string; market_id: string; started_at: string };
}

export interface BetResponse {
  bet: BetRecord | null;
  /** Server's AUTO_BET flag. When false, the client suppresses the bets panel. */
  auto_bet_enabled: boolean;
  /** "mainnet" | "testnet" — used to build the explorer link. */
  network: string;
}

export async function fetchBet(duelId: string): Promise<BetResponse> {
  const data = await getJson<{
    duel_id: string;
    bet: BetRecord | null;
    auto_bet_enabled: boolean;
    network: string;
  }>(`/api/bet?duel_id=${encodeURIComponent(duelId)}`);
  return {
    bet: data.bet,
    auto_bet_enabled: data.auto_bet_enabled,
    network: data.network,
  };
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
