/**
 * Phase 6 — Bull agent. Communicates with bear over the AXL mesh.
 *
 * Usage:
 *   pnpm dev:bull <market-id>
 *
 * Bull is the duel opener. It mints a duel_id, sends round 0 to bear,
 * then alternates with bear over /send + /recv until both have produced
 * their share of turns. Every turn (own and peer's) is persisted to
 * SQLite at <repo-root>/data.db.
 *
 * Env (read from .env.local at repo root):
 *   ANTHROPIC_API_KEY      — required, for Claude
 *   DELPHI_API_ACCESS_KEY  — required, for fetchMarket
 *   DELPHI_NETWORK         — testnet|mainnet (default testnet)
 *   DELPHI_DUEL_TURNS      — total turns across both agents (default 4)
 *   DELPHI_DUEL_DB         — override SQLite path (default repo-root/data.db)
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "@delphi-duel/agents-shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", "..", ".env.local"), override: true });

const marketId = process.argv[2];
if (!marketId) {
  console.error("usage: pnpm dev:bull <market-id>");
  process.exit(1);
}

runAgent({ role: "bull", marketId }).catch((err) => {
  console.error("[bull] FAIL:", err?.message ?? err);
  if (process.env.DEBUG) console.error(err?.stack ?? "");
  process.exit(1);
});
