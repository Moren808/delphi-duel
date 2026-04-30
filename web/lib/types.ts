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

export interface DemoMarket {
  id: string;
  category?: string;
  question?: string;
  outcomes?: string[];
  resolves_at?: string;
  demo_pitch?: string;
}
