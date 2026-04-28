/**
 * Phase 4 — CLI to list Delphi markets.
 *
 * Usage:
 *   pnpm list-markets                       # default: open + crypto, top 10
 *   pnpm list-markets <status> [category] [limit]
 *   pnpm list-markets open politics 5
 *   pnpm list-markets open '' 20            # no category filter
 *
 * Reads DELPHI_NETWORK (default "testnet") and optional
 * DELPHI_API_ACCESS_KEY from .env.local.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listMarkets, type SdkMarket } from "@delphi-duel/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", ".env.local"), override: true });

interface MetaPreview {
  question?: string;
  title?: string;
  outcomes?: string[];
}

function metaPreview(m: unknown): MetaPreview {
  return (m && typeof m === "object" ? (m as MetaPreview) : {}) ?? {};
}

async function main(): Promise<void> {
  const status = process.argv[2] || "open";
  const categoryArg = process.argv[3] || "";
  const limit = Number(process.argv[4] || "10");

  const network = process.env.DELPHI_NETWORK ?? "testnet";
  const hasKey = Boolean(process.env.DELPHI_API_ACCESS_KEY);

  console.log(
    `Listing markets (network=${network}, status=${status}` +
      (categoryArg ? `, category=${categoryArg}` : "") +
      `, limit=${limit}, apiKey=${hasKey ? "set" : "unset"})`,
  );
  console.log("");

  const markets: SdkMarket[] = await listMarkets({
    status,
    ...(categoryArg ? { category: categoryArg } : {}),
    orderBy: "liquidity",
    limit,
  });

  if (markets.length === 0) {
    console.log("(no markets returned)");
    return;
  }

  for (const m of markets) {
    const meta = metaPreview(m.metadata);
    const title = meta.question ?? meta.title ?? "(untitled)";
    const outcomesStr = meta.outcomes?.join(" / ") ?? "(no outcomes in metadata)";
    const resolves = m.resolvesAt ?? "(no resolvesAt)";
    console.log(`• ${m.id}`);
    console.log(`  category : ${m.category}`);
    console.log(`  status   : ${m.status}`);
    console.log(`  resolves : ${resolves}`);
    console.log(`  outcomes : ${outcomesStr}`);
    console.log(`  q        : ${title}`);
    console.log("");
  }
  console.log(`(${markets.length} market${markets.length === 1 ? "" : "s"})`);
}

main().catch((err) => {
  console.error("FAIL:", err?.message ?? err);
  if (process.env.DEBUG) console.error(err?.stack ?? "");
  process.exit(1);
});
