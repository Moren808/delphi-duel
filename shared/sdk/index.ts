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

/* ---------- listAllMarkets — paginated full sweep ---------- */

/**
 * Slim summary shape used by the dashboard's market picker. Distinct
 * from the full canonical Market so we can return many of these fast
 * without running per-market subgraph queries for implied_probabilities
 * (those happen lazily via /api/market/<id> when the user actually
 * selects a market).
 */
export interface MarketSummary {
  id: string;
  question: string;
  /** SDK-assigned category (crypto / sports / politics / culture / miscellaneous / economics). */
  category: string;
  outcomes: string[];
  /** ISO 8601, or empty string if the market metadata had no resolves field. */
  close_date: string;
  status: string;
  /**
   * Optional — implied probabilities per outcome. NOT populated by
   * listAllMarkets() because that would require N subgraph round-trips.
   * Only present when the caller explicitly asked for it.
   */
  implied_probabilities?: number[];
  /**
   * Optional — total trade volume. Same caveat as implied_probabilities.
   * Reserved for future use.
   */
  volume?: number;
}

/**
 * Project an SDK Market (with its `metadata: unknown`) into our slim
 * MarketSummary. Pure — no network calls.
 */
function summarise(sdk: SdkMarket): MarketSummary {
  const meta = asMetadata(sdk.metadata);
  const outcomes =
    Array.isArray(meta.outcomes) && meta.outcomes.length > 0
      ? meta.outcomes.map((o) => String(o))
      : ["Yes", "No"];
  const question =
    meta.question ?? meta.title ?? `(market ${sdk.id.slice(0, 12)}…)`;
  const close = sdk.resolvesAt ?? meta.endDate ?? sdk.settlesAt ?? null;
  return {
    id: sdk.id,
    question: String(question).trim(),
    category: sdk.category || meta.category || "miscellaneous",
    outcomes,
    close_date: close ? new Date(close).toISOString() : "",
    status: sdk.status,
  };
}

/**
 * Fetch ALL open markets via repeated listMarkets() calls until the
 * SDK returns an empty page. Default page size is 50 (the SDK's max),
 * so a typical mainnet sweep is 2–4 pages.
 *
 * Use this for the picker dropdown. Per-market hydration of
 * implied_probabilities / volume happens lazily via fetchMarket()
 * (which hits the subgraph) when a market is actually selected.
 *
 * @param opts.status      "open" | "closed" | "settled". Default "open".
 * @param opts.category    Filter at the API level. Default: no filter.
 * @param opts.pageSize    Page size — default 50, the SDK cap.
 * @param opts.maxPages    Safety cap on iterations. Default 20 (= 1000 markets).
 */
export async function listAllMarkets(opts: {
  status?: string;
  category?: string;
  pageSize?: number;
  maxPages?: number;
} = {}): Promise<MarketSummary[]> {
  const status = opts.status ?? "open";
  const category = opts.category;
  const pageSize = opts.pageSize ?? 50;
  const maxPages = opts.maxPages ?? 20;

  const client = getClient();
  const out: MarketSummary[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const skip = page * pageSize;
    const { markets } = await client.listMarkets({
      status,
      ...(category ? { category } : {}),
      skip,
      limit: pageSize,
    });
    if (!markets || markets.length === 0) break;
    for (const m of markets) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(summarise(m));
    }
    if (markets.length < pageSize) break; // last page (partial)
  }
  return out;
}

/* ────────────────────  Phase 12: autonomous betting  ──────────────────── */

/**
 * Lazy write-client. Distinct from the read-only `getClient()` because
 * write operations need a REAL signer (the read client uses a sentinel
 * 0x00 key that throws if you call signing methods). Only instantiated
 * when placeBet is actually called.
 */
let _writeClient: DelphiClient | null = null;
function getWriteClient(): DelphiClient {
  if (_writeClient) return _writeClient;

  const apiKey = process.env.DELPHI_API_ACCESS_KEY;
  const privateKey = process.env.MAINNET_WALLET_PRIVATE_KEY;
  const network = (process.env.DELPHI_NETWORK as Network | undefined) ?? "mainnet";

  if (!apiKey) {
    throw new Error("DELPHI_API_ACCESS_KEY is not set");
  }
  if (!privateKey) {
    throw new Error(
      "MAINNET_WALLET_PRIVATE_KEY is not set — required when AUTO_BET=true",
    );
  }
  if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
    throw new Error(
      "MAINNET_WALLET_PRIVATE_KEY must be a 0x-prefixed 64-char hex string",
    );
  }

  _writeClient = new DelphiClient({
    network,
    apiKey,
    signerType: "private_key",
    privateKey: privateKey as `0x${string}`,
  });
  return _writeClient;
}

export interface PlaceBetResult {
  /** On-chain transaction hash. */
  tx_hash: `0x${string}`;
  /** Outcome shares purchased (18 decimals as bigint). */
  shares_out: bigint;
  /** Actual USDC spent (6 decimals as bigint). */
  tokens_in: bigint;
  /** USDC spent in human units. */
  spent_usdc: number;
  /** Wallet that placed the bet. */
  buyer_address: `0x${string}`;
}

/**
 * Place an on-chain bet on a Delphi market.
 *
 * Flow:
 *   1. Quote — estimate share count from `amountUsdc / impliedProbability`,
 *      then call quoteBuy() to get the exact tokensIn for that share count.
 *   2. Re-scale if the quote came back higher than the budget (rare, but
 *      possible if the implied probability slid between the read and the
 *      quote).
 *   3. ensureTokenApproval — checks USDC allowance for the gateway and
 *      bumps it if needed (idempotent — no tx if approval already covers).
 *   4. buyShares — submits the on-chain transaction with 5% slippage
 *      tolerance on tokensIn.
 *
 * Throws on:
 *   - missing wallet env / malformed key
 *   - quote/approval/buy chain failure (e.g. BuyTooSmall — the market
 *     has a minimum bet size below which it won't accept)
 *   - amountUsdc <= 0
 *
 * Caller is responsible for AUTO_BET gating, daily caps, and logging
 * the result to SQLite.
 *
 * @param marketAddress  Delphi market proxy contract (the same value as
 *                       Market.id). Must be `0x`-prefixed.
 * @param outcomeIdx     0-indexed outcome to buy.
 * @param amountUsdc     Target USDC to spend, in human units (not wei).
 *                       e.g. 2.50 = $2.50.
 */
export async function placeBet(
  marketAddress: string,
  outcomeIdx: number,
  amountUsdc: number,
): Promise<PlaceBetResult> {
  if (!marketAddress.startsWith("0x")) {
    throw new Error(`marketAddress must be 0x-prefixed (got ${marketAddress})`);
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error(`amountUsdc must be > 0 (got ${amountUsdc})`);
  }

  const client = getWriteClient();
  const market = `0x${marketAddress.slice(2)}` as `0x${string}`;

  // USDC has 6 decimals on Gensyn networks per SDK README.
  const USDC_DECIMALS = 6n;
  const SHARE_DECIMALS = 18n;
  const targetTokensIn = BigInt(Math.round(amountUsdc * 1_000_000));

  // Read implied probability for the chosen outcome to estimate shares.
  // Probability is bounded [0, 1]. Worst case (prob ~0) we cap at 0.01 to
  // avoid unbounded share counts — the caller should never trigger this
  // because the judge's "neutral" filter blocks bets on near-zero outcomes.
  const summary = await fetchMarket(marketAddress);
  const probRaw = summary.implied_probabilities[outcomeIdx];
  const prob = !probRaw || probRaw < 0.01 ? 0.01 : probRaw;

  // Estimate shares: at parimutuel pricing, share_price ≈ probability.
  // shares = (amountUsdc / prob), scaled to 18 decimals.
  const sharesEstimate = BigInt(
    Math.floor((amountUsdc / prob) * 10 ** Number(SHARE_DECIMALS)),
  );

  // Quote the estimate to get exact tokensIn.
  const { tokensIn: quoteTokens } = await client.quoteBuy({
    marketAddress: market,
    outcomeIdx,
    sharesOut: sharesEstimate,
  });

  // If the real quote is over budget (slippage from our prob estimate),
  // scale shares down proportionally and re-quote once.
  let actualShares = sharesEstimate;
  let actualTokens = quoteTokens;
  if (quoteTokens > targetTokensIn) {
    actualShares = (sharesEstimate * targetTokensIn) / quoteTokens;
    const refined = await client.quoteBuy({
      marketAddress: market,
      outcomeIdx,
      sharesOut: actualShares,
    });
    actualTokens = refined.tokensIn;
  }

  // Ensure USDC approval covers the buy (idempotent — no-op if already set).
  await client.ensureTokenApproval({
    marketAddress: market,
    minimumAmount: actualTokens,
  });

  // Submit with 5% slippage cap on tokensIn.
  const maxTokensIn = (actualTokens * 105n) / 100n;
  const { transactionHash } = await client.buyShares({
    marketAddress: market,
    outcomeIdx,
    sharesOut: actualShares,
    maxTokensIn,
  });

  const signer = await client.getSigner();
  const _ = USDC_DECIMALS; // silence unused-var lint

  return {
    tx_hash: transactionHash,
    shares_out: actualShares,
    tokens_in: actualTokens,
    spent_usdc: Number(actualTokens) / 1_000_000,
    buyer_address: signer.address,
  };
}

export type { Market } from "@delphi-duel/shared-types";
export type { Market as SdkMarket } from "@gensyn-ai/gensyn-delphi-sdk";
