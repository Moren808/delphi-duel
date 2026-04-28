/**
 * Canonical Market type used across the duel.
 *
 * All upstream sources (Delphi REST, subgraph, on-chain reads) collapse
 * into this shape. The agents debate against this type, not the SDK's
 * native Market shape — keeps protocol stable as upstream evolves.
 */
export interface Market {
  /** Delphi market ID (also the on-chain market proxy address). */
  id: string;

  /**
   * Full text the agents debate against. Concatenates the market question,
   * description, and resolution criteria from Delphi metadata. Multi-line.
   */
  prompt: string;

  /** Outcome labels in canonical (on-chain) order. */
  outcomes: string[];

  /**
   * Market-implied probability per outcome, same length as `outcomes`.
   * Sums to ~1. Derived from net tokens-in per outcome via subgraph trade
   * history; falls back to a uniform prior if no trades yet.
   */
  implied_probabilities: number[];

  /** ISO 8601 timestamp at which the market closes / resolves. */
  close_date: string;

  /** Delphi category (crypto, culture, economics, miscellaneous, politics, sports). */
  category?: string;
}
