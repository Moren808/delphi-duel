/**
 * Phase 9 — Judge agent. Mirror of bull/index.ts in shape, but the
 * judge has no rounds — it processes each incoming DuelTranscript
 * and goes back to polling.
 *
 * Usage:
 *   pnpm dev:judge
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runJudge } from "@delphi-duel/agents-shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", "..", ".env.local"), override: true });

runJudge().catch((err) => {
  console.error("[judge] FAIL:", err?.message ?? err);
  if (process.env.DEBUG) console.error(err?.stack ?? "");
  process.exit(1);
});
