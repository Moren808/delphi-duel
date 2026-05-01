/**
 * Wire types shared between API routes and the client.
 *
 * Mirror of agents/shared/protocol.ts TurnRecord, but using a plain
 * boolean for is_final (the storage layer normalises it from SQLite's
 * INTEGER 0/1 in the API response).
 */

export type AgentRole = "bull" | "bear";

export interface TurnRecord {
  duel_id: string;
  round: number;
  role: AgentRole;
  market_id: string;
  champion_outcome_idx: number;
  probability: number;
  confidence: number;
  reasoning: string;
  message_to_peer: string;
  is_final: boolean;
  produced_at: string;
  /** Multi-outcome only — name of the outcome bull is championing. */
  bull_outcome?: string;
  /** Multi-outcome only — name of the outcome bear is championing. */
  bear_outcome?: string;
}

export interface MeshStatus {
  bull: boolean;
  bear: boolean;
  judge: boolean;
  detail?: {
    bull?: { reachable: boolean; public_key?: string; peering?: boolean | null };
    bear?: { reachable: boolean; public_key?: string; peering?: boolean | null };
    judge?: { reachable: boolean; public_key?: string; peering?: boolean | null };
  };
}

export interface VerdictRecord {
  duel_id: string;
  market_id: string;
  winner: "bull" | "bear" | "inconclusive";
  confidence: number;
  reasoning: string;
  suggested_lean: "lean YES" | "lean NO" | "too close to call" | string;
  recommended_position:
    | "strong YES"
    | "moderate YES"
    | "neutral"
    | "moderate NO"
    | "strong NO"
    | string;
  produced_at: string;
}

export type BetStatus = "placed" | "failed" | "skipped";

/**
 * One row from the SQLite `bets` table — the judge writes one per duel
 * once it reaches the betting branch (AUTO_BET=true and verdict
 * confidence ≥ threshold).
 */
export interface BetRecord {
  duel_id: string;
  market_id: string;
  /** 0-indexed outcome the judge bought shares of. */
  outcome_index: number;
  /** Target USDC amount, human units (not wei). */
  amount_usdc: number;
  /** On-chain tx hash if `status === "placed"`, else null. */
  tx_hash: string | null;
  status: BetStatus;
  /** Free-form error / skip reason. */
  error: string | null;
  /** ISO 8601. */
  timestamp: string;
}

export interface DemoMarket {
  id: string;
  category?: string;
  question?: string;
  outcomes?: string[];
  resolves_at?: string;
  demo_pitch?: string;
}

/**
 * Slim shape returned by /api/markets (live Delphi sweep). Mirrors
 * MarketSummary from @delphi-duel/sdk. The picker dropdown uses this
 * directly; only on selection do we hit /api/market/<id> for the
 * full canonical Market with implied_probabilities.
 */
export interface MarketSummary {
  id: string;
  question: string;
  category: string;
  outcomes: string[];
  close_date: string;
  status: string;
  implied_probabilities?: number[];
  volume?: number;
}
