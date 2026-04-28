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

/** Full record of one turn — what gets piped between agents and (later) stored. */
export const TurnRecordSchema = TurnPayloadSchema.extend({
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
  /** ISO 8601 — when the turn was produced. */
  produced_at: z.string(),
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

/** Roles. */
export type AgentRole = "bull" | "bear";
export const peerRole = (role: AgentRole): AgentRole =>
  role === "bull" ? "bear" : "bull";
