/**
 * Phase 4 — Read-only wrapper around @gensyn-ai/gensyn-delphi-sdk.
 *
 * Exposes a single function — `fetchMarket(marketId)` — that returns
 * a canonical Market shape (see @delphi-duel/shared-types). Internally:
 *
 *   1. Calls DelphiClient.getMarket() for metadata, category, close date.
 *   2. Calls SubgraphClient.getMarketTrades() to derive market-implied
 *      probabilities from net tokens-in per outcome (no signer needed).
 *   3. Falls back to a uniform prior if no trades exist yet.
 *
 * Config: `DELPHI_NETWORK` (default "testnet"). `DELPHI_API_ACCESS_KEY` is
 * passed through if set; some deployments allow unauthenticated reads, so
 * the wrapper does not require it. Upstream will return 401/403 if it does.
 */

import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";
import type {
  Market as SdkMarket,
  Network,
  ListMarketsParams,
  SubgraphBuy,
  SubgraphSell,
} from "@gensyn-ai/gensyn-delphi-sdk";
import type { Market } from "@delphi-duel/shared-types";

// Defensive shape for the `metadata: unknown` field on the SDK Market.
// Per docs, fields below are typical; all are optional.
interface DelphiMetadata {
  question?: string;
  title?: string;
  description?: string;
  category?: string;
  outcomes?: string[];
  resolutionCriteria?: string;
  endDate?: string;
}

function asMetadata(m: unknown): DelphiMetadata {
  return (m && typeof m === "object" ? (m as DelphiMetadata) : {}) ?? {};
}

let _client: DelphiClient | null = null;

/**
 * Lazily build a DelphiClient for read-only use. apiKey is passed through
 * if DELPHI_API_ACCESS_KEY is set; otherwise we let upstream decide whether
 * to allow the request (some Delphi deployments permit unauthenticated reads).
 */
function getClient(): DelphiClient {
  if (_client) return _client;

  const network = (process.env.DELPHI_NETWORK as Network | undefined) ?? "testnet";
  const apiKey = process.env.DELPHI_API_ACCESS_KEY;

  // The SDK constructor never *uses* signing creds for read-only methods,
  // but the default signerType is "cdp_server_wallet" and `getSigner()` would
  // throw if called. We pin signerType to "private_key" with a throwaway 0
  // key so the client constructs cleanly; reads never invoke the signer.
  _client = new DelphiClient({
    network,
    ...(apiKey ? { apiKey } : {}),
    signerType: "private_key",
    privateKey: ("0x" + "00".repeat(32)) as `0x${string}`,
  });
  return _client;
}

/**
 * Compute market-implied probabilities from cumulative buy/sell volume
 * per outcome. Net tokens deposited (buys - sells) per outcome,
 * normalized to sum to 1. Returns null on any failure so the caller
 * can fall back to a uniform prior.
 */
async function deriveImpliedProbabilities(
  marketProxy: string,
  outcomeCount: number,
): Promise<number[] | null> {
  if (outcomeCount <= 0) return null;
  try {
    const subgraph = getClient().getSubgraph();
    const { buys, sells } = await subgraph.getMarketTrades(marketProxy, {
      first: 1000,
    });

    const netTokens = new Array<number>(outcomeCount).fill(0);
    for (const b of buys as SubgraphBuy[]) {
      const idx = b.outcomeIdx == null ? -1 : Number(b.outcomeIdx);
      const tokens = b.tokensIn == null ? 0 : Number(b.tokensIn);
      if (idx >= 0 && idx < outcomeCount && Number.isFinite(tokens)) {
        netTokens[idx] += tokens;
      }
    }
    for (const s of sells as SubgraphSell[]) {
      const idx = s.outcomeIdx == null ? -1 : Number(s.outcomeIdx);
      const tokens = s.tokensOut == null ? 0 : Number(s.tokensOut);
      if (idx >= 0 && idx < outcomeCount && Number.isFinite(tokens)) {
        netTokens[idx] -= tokens;
      }
    }

    // Clip negatives to 0; a single outcome going net-negative
    // is not meaningful as a probability.
    const clipped = netTokens.map((n) => Math.max(0, n));
    const total = clipped.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    return clipped.map((n) => n / total);
  } catch {
    return null;
  }
}

function uniformPrior(n: number): number[] {
  if (n <= 0) return [];
  return new Array<number>(n).fill(1 / n);
}

/**
 * Fetch a Delphi market by ID and project it into the canonical Market type.
 * Read-only. Throws on missing API key or 4xx/5xx from upstream.
 */
export async function fetchMarket(marketId: string): Promise<Market> {
  if (!marketId || typeof marketId !== "string") {
    throw new Error("fetchMarket: marketId must be a non-empty string");
  }
  const client = getClient();
  const sdkMarket: SdkMarket = await client.getMarket({ id: marketId });

  const metadata = asMetadata(sdkMarket.metadata);

  // Outcome labels: prefer metadata.outcomes; fall back to ["Yes", "No"]
  // (the most common Delphi market shape).
  const outcomes =
    Array.isArray(metadata.outcomes) && metadata.outcomes.length > 0
      ? metadata.outcomes.map((o) => String(o))
      : ["Yes", "No"];

  // Stitch a debate prompt: question + description + resolution criteria.
  const promptParts: string[] = [];
  const headline = metadata.question ?? metadata.title;
  if (headline) promptParts.push(headline.trim());
  if (metadata.description?.trim()) promptParts.push(metadata.description.trim());
  if (metadata.resolutionCriteria?.trim()) {
    promptParts.push(`Resolution criteria: ${metadata.resolutionCriteria.trim()}`);
  }
  const prompt =
    promptParts.length > 0
      ? promptParts.join("\n\n")
      : `(Market ${marketId} has no metadata text.)`;

  // Close date: prefer top-level resolvesAt, then metadata.endDate, then
  // settlesAt as a last resort. Always emit ISO 8601.
  const rawClose =
    sdkMarket.resolvesAt ?? metadata.endDate ?? sdkMarket.settlesAt ?? null;
  const close_date = rawClose ? new Date(rawClose).toISOString() : "";

  const probs =
    (await deriveImpliedProbabilities(sdkMarket.id, outcomes.length)) ??
    uniformPrior(outcomes.length);

  // Pair outcomes + probabilities for the UI; same canonical (on-chain)
  // order. Sorting is left to the caller (the picker sorts by prob to
  // pick defaults but renders the dropdown in canonical order).
  const outcomes_list = outcomes.map((name, i) => ({
    name,
    probability: probs[i] ?? 0,
  }));

  // Binary = exactly 2 outcomes (Yes/No-style). Anything else is multi.
  const market_type: "binary" | "multi_outcome" =
    outcomes.length === 2 ? "binary" : "multi_outcome";

  return {
    id: sdkMarket.id,
    prompt,
    outcomes,
    implied_probabilities: probs,
    close_date,
    category: sdkMarket.category || metadata.category || undefined,
    market_type,
    outcomes_list,
  };
}

/**
 * List markets (read-only). Thin pass-through to the SDK; no projection
 * because the listing UI usually wants raw fields (id, status, category,
 * created/resolves dates) rather than the full canonical Market shape.
 */
export async function listMarkets(
  params?: ListMarketsParams,
): Promise<SdkMarket[]> {
  const { markets } = await getClient().listMarkets(params);
  return markets ?? [];
}

export type { Market } from "@delphi-duel/shared-types";
export type { Market as SdkMarket } from "@gensyn-ai/gensyn-delphi-sdk";
