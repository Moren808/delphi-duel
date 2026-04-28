/**
 * Phase 6 — Bear agent. Mirror of bull/index.ts; only the role differs.
 *
 * Usage:
 *   pnpm dev:bear <market-id>
 *
 * Bear waits on /recv for bull's opening, then alternates with bull over
 * the AXL mesh until both have produced their share of turns. See
 * agents/shared/agent-runner.ts for the loop body.
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
  console.error("usage: pnpm dev:bear <market-id>");
  process.exit(1);
}

runAgent({ role: "bear", marketId }).catch((err) => {
  console.error("[bear] FAIL:", err?.message ?? err);
  if (process.env.DEBUG) console.error(err?.stack ?? "");
  process.exit(1);
});
