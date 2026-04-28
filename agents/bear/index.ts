/**
 * Phase 5 — Bear agent CLI. Mirror of bull/index.ts; only role differs.
 *
 * Usage:
 *   echo '<bull JSON>' | tsx agents/bear/index.ts <market-id>
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchMarket } from "@delphi-duel/sdk";
import { runTurn, TurnRecordSchema } from "@delphi-duel/agents-shared";
import type { TurnRecord } from "@delphi-duel/agents-shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", "..", ".env.local"), override: true });

const ROLE = "bear" as const;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main(): Promise<void> {
  const marketId = process.argv[2];
  if (!marketId) {
    console.error("usage: tsx agents/bear/index.ts <market-id>  [peer JSON on stdin]");
    process.exit(1);
  }

  const stdinText = await readStdin();
  let peer: TurnRecord | null = null;
  let nextRound = 0;

  if (stdinText) {
    const parsed = TurnRecordSchema.safeParse(JSON.parse(stdinText));
    if (!parsed.success) {
      console.error("Bear: stdin did not parse as TurnRecord:");
      console.error(parsed.error.format());
      process.exit(2);
    }
    peer = parsed.data;
    if (peer.role !== "bull") {
      console.error(`Bear: expected peer.role="bull", got "${peer.role}"`);
      process.exit(2);
    }
    if (peer.market_id !== marketId) {
      console.error(
        `Bear: peer.market_id (${peer.market_id}) != argv market (${marketId})`,
      );
      process.exit(2);
    }
    nextRound = peer.round + 1;
  } else {
    // Bear shouldn't be the opener in our protocol (Bull opens at round 0).
    // Keep the path working for ad-hoc testing but warn.
    console.error("[bear] WARNING: no stdin received; bear is opening (round 0). Bull is the canonical opener.");
  }

  console.error(
    `[bear] market=${marketId} round=${nextRound}` +
      (peer ? ` (responding to bull round ${peer.round})` : " (opening)"),
  );

  const market = await fetchMarket(marketId);
  console.error(`[bear] market loaded: ${market.outcomes.length} outcomes`);

  const turn = await runTurn({
    role: ROLE,
    market,
    champion_outcome_idx: peer?.champion_outcome_idx ?? 0,
    round: nextRound,
    peerLastMessage: peer?.message_to_peer ?? null,
  });

  console.error(
    `[bear] done. probability=${turn.probability.toFixed(3)} confidence=${turn.confidence.toFixed(2)}`,
  );

  process.stdout.write(JSON.stringify(turn) + "\n");
}

main().catch((err) => {
  console.error("[bear] FAIL:", err?.message ?? err);
  if (process.env.DEBUG) console.error(err?.stack ?? "");
  process.exit(1);
});
