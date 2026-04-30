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
  /**
   * Multi-outcome head-to-head: name of the outcome bull is defending.
   * Both fields are present together (or both absent for binary markets).
   * Stamped on every turn so the judge / UI can render outcome names
   * without re-resolving from market_id.
   */
  bull_outcome: z.string().optional(),
  /** Multi-outcome head-to-head: name of the outcome bear is defending. */
  bear_outcome: z.string().optional(),
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

/** Roles. */
export type AgentRole = "bull" | "bear";
export const peerRole = (role: AgentRole): AgentRole =>
  role === "bull" ? "bear" : "bull";

/* ────────────────────────────  Phase 9: judge  ──────────────────────────── */

/** What the judge LLM emits — the strict-JSON output of the verdict prompt. */
export const VerdictPayloadSchema = z.object({
  winner: z.enum(["bull", "bear", "inconclusive"]),
  confidence: z.number().min(0).max(1),
  /** 2–3 sentences of judging reasoning, shown to the trader. */
  reasoning: z.string().min(1),
  /** Plain-English directional read. */
  suggested_lean: z.enum(["lean YES", "lean NO", "too close to call"]),
  /** Trade-sizing recommendation. */
  recommended_position: z.enum([
    "strong YES",
    "moderate YES",
    "neutral",
    "moderate NO",
    "strong NO",
  ]),
});
export type VerdictPayload = z.infer<typeof VerdictPayloadSchema>;

/** Full verdict record — persisted to SQLite, sent over AXL from judge → coordinator. */
export const VerdictRecordSchema = VerdictPayloadSchema.extend({
  duel_id: z.string().min(1),
  market_id: z.string().min(1),
  /** ISO 8601. */
  produced_at: z.string(),
});
export type VerdictRecord = z.infer<typeof VerdictRecordSchema>;

/**
 * Coordinator → judge envelope: a single message that ships the entire
 * complete duel transcript so the judge can read both sides at once.
 */
export const DuelTranscriptSchema = z.object({
  type: z.literal("duel_transcript"),
  duel_id: z.string().min(1),
  market_id: z.string().min(1),
  market_question: z.string().min(1),
  /** All turns, ordered by round. */
  turns: z.array(TurnRecordSchema).min(1),
});
export type DuelTranscript = z.infer<typeof DuelTranscriptSchema>;

/**
 * Judge → coordinator envelope: thin wrapper around VerdictRecord with a
 * `type` discriminant so the coordinator can multiplex if needed.
 */
export const DuelVerdictSchema = z.object({
  type: z.literal("duel_verdict"),
  verdict: VerdictRecordSchema,
});
export type DuelVerdict = z.infer<typeof DuelVerdictSchema>;
