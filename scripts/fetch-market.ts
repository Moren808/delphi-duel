/**
 * Phase 4 — CLI test for fetchMarket().
 *
 * Usage:
 *   pnpm fetch-market <market-id>
 *
 * Reads DELPHI_API_ACCESS_KEY (and optional DELPHI_NETWORK) from .env.local
 * at the repo root.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchMarket } from "@delphi-duel/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Also load .env.local if present (overrides .env). Vercel-style convention.
loadEnv({ path: resolve(__dirname, "..", ".env.local"), override: true });

async function main(): Promise<void> {
  const marketId = process.argv[2];
  if (!marketId) {
    console.error("usage: pnpm fetch-market <market-id>");
    process.exit(1);
  }

  console.log(`Fetching market ${marketId} from Delphi (network=${process.env.DELPHI_NETWORK ?? "testnet"})...`);
  console.log("");

  const market = await fetchMarket(marketId);

  console.log("Canonical Market:");
  console.log(JSON.stringify(market, null, 2));
  console.log("");
  console.log("Sanity:");
  const sum = market.implied_probabilities.reduce((a, b) => a + b, 0);
  console.log(`  outcomes.length              = ${market.outcomes.length}`);
  console.log(`  implied_probabilities.length = ${market.implied_probabilities.length}`);
  console.log(`  Σ implied_probabilities       = ${sum.toFixed(6)}`);
}

main().catch((err) => {
  console.error("FAIL:", err?.message ?? err);
  if (process.env.DEBUG) console.error(err?.stack ?? "");
  process.exit(1);
});
