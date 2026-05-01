/**
 * GET /api/markets
 * GET /api/markets?refresh=1
 *
 * Returns ALL open Delphi mainnet markets via paginated listMarkets()
 * calls through the SDK wrapper. Includes a 30-second module-level
 * cache so the picker dropdown doesn't hammer Delphi on every page
 * load — pass `?refresh=1` to bypass.
 *
 * Response shape:
 *   { markets: MarketSummary[], cached: boolean, fetched_at: ISO string }
 *
 * In demo mode (no DELPHI_API_ACCESS_KEY) returns 503 with a clear
 * message; the picker falls back to the bundled demo-markets.json.
 */

import { listAllMarkets, type MarketSummary } from "@delphi-duel/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;
let CACHE: { fetched_at: number; markets: MarketSummary[] } | null = null;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const force = url.searchParams.get("refresh") === "1";

  if (!force && CACHE && Date.now() - CACHE.fetched_at < CACHE_TTL_MS) {
    return Response.json({
      markets: CACHE.markets,
      cached: true,
      fetched_at: new Date(CACHE.fetched_at).toISOString(),
    });
  }

  if (!process.env.DELPHI_API_ACCESS_KEY) {
    return Response.json(
      {
        error:
          "DELPHI_API_ACCESS_KEY not configured (demo mode) — client should fall back to bundled demo-markets.json",
      },
      { status: 503 },
    );
  }

  try {
    const markets = await listAllMarkets({ status: "open" });
    CACHE = { fetched_at: Date.now(), markets };
    return Response.json({
      markets,
      cached: false,
      fetched_at: new Date(CACHE.fetched_at).toISOString(),
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "listAllMarkets failed" },
      { status: 502 },
    );
  }
}
