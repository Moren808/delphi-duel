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
  detail?: {
    bull?: { reachable: boolean; public_key?: string; peering?: boolean | null };
    bear?: { reachable: boolean; public_key?: string; peering?: boolean | null };
  };
}

export interface DemoMarket {
  id: string;
  category?: string;
  question?: string;
  outcomes?: string[];
  resolves_at?: string;
  demo_pitch?: string;
}
