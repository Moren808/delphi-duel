/**
 * Phase 5/6 — Wire protocol for the duel.
 *
 * The LLM produces a `TurnPayload` (probability/confidence/reasoning/
 * message_to_peer). Phase 5 uses these directly between bull and bear
 * via stdin/stdout piping. Phase 6 will wrap them in AXL-routed envelopes.
 */

import { z } from "zod";

/** Output of a single Claude turn — must match the JSON in the system prompts. */
export const TurnPayloadSchema = z.object({
  probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  message_to_peer: z.string().min(1),
});
export type TurnPayload = z.infer<typeof TurnPayloadSchema>;

/** Full record of one turn — sent over AXL between agents and persisted to SQLite. */
export const TurnRecordSchema = TurnPayloadSchema.extend({
  /**
   * Unique per duel. Bull generates it on startup and includes it in every
   * turn it sends; bear echoes whatever bull set. Both agents key SQLite
   * rows by (duel_id, round).
   */
  duel_id: z.string().min(1),
  /** Monotonically increasing across the whole duel. Bull opens at 0. */
  round: z.number().int().min(0),
  role: z.enum(["bull", "bear"]),
  market_id: z.string().min(1),
  /**
   * 0-indexed outcome the agent is defending. Equals 0 for binary "Yes/No"
   * markets. The orchestrator picks this for multi-outcome markets and both
   * agents must use the same value.
   */
  champion_outcome_idx: z.number().int().min(0),
  /**
   * Set true on the producer's last turn. The receiver, on observing this,
   * may produce its own final turn and then exit without polling further.
   */
  is_final: z.boolean(),
  /** ISO 8601 — when the turn was produced. */
  produced_at: z.string(),
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

/** Roles. */
export type AgentRole = "bull" | "bear";
export const peerRole = (role: AgentRole): AgentRole =>
  role === "bull" ? "bear" : "bull";
