/**
 * Phase 7 — Single-command duel orchestrator.
 *
 * Usage:
 *   pnpm run-duel                # pick a random market from demo-markets.json
 *   pnpm run-duel <market-id>    # run on a specific market
 *
 * What it does:
 *   1. Validate arg / pick market
 *   2. Ensure both AXL nodes are up + peering — start the mesh if not
 *   3. Spawn bear (background, polling), wait 1s, spawn bull
 *   4. Stream both agents' stderr to our stderr with colored prefixes
 *   5. Wait for both to exit
 *   6. Summarize from data.db: question, opening probabilities, final
 *      probabilities, who moved more, total rounds
 *   7. SIGINT (ctrl+c): SIGTERM both children, then SIGKILL on second hit
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { fetchMarket } from "@delphi-duel/sdk";
import { DEFAULT_DB_PATH } from "@delphi-duel/agents-shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
loadEnv({ path: resolve(REPO_ROOT, ".env.local"), override: true });

const BULL_API = "http://127.0.0.1:9002";
const BEAR_API = "http://127.0.0.1:9012";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---------------- market selection ---------------- */

interface DemoMarket {
  id: string;
  category?: string;
  question?: string;
}

function readDemoMarkets(): DemoMarket[] {
  const path = resolve(REPO_ROOT, "demo-markets.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as { markets?: DemoMarket[] };
  if (!raw.markets || raw.markets.length === 0) {
    throw new Error(`demo-markets.json has no markets`);
  }
  return raw.markets;
}

function pickMarketId(arg: string | undefined): string {
  if (arg) return arg;
  const markets = readDemoMarkets();
  const pick = markets[Math.floor(Math.random() * markets.length)];
  console.error(
    `${DIM}[orchestrator] no market ID given; picked ${pick.id} (${pick.category}) from demo-markets.json${RESET}`,
  );
  return pick.id;
}

/* ---------------- mesh readiness ---------------- */

interface Topology {
  our_public_key: string;
  peers: Array<{ public_key: string; up: boolean }>;
}

async function fetchTopology(api: string): Promise<Topology | null> {
  try {
    const res = await fetch(`${api}/topology`);
    if (!res.ok) return null;
    return (await res.json()) as Topology;
  } catch {
    return null;
  }
}

async function meshIsReady(): Promise<boolean> {
  const [bull, bear] = await Promise.all([
    fetchTopology(BULL_API),
    fetchTopology(BEAR_API),
  ]);
  if (!bull || !bear) return false;
  const bullSeesBear = bull.peers.some(
    (p) => p.public_key === bear.our_public_key && p.up,
  );
  const bearSeesBull = bear.peers.some(
    (p) => p.public_key === bull.our_public_key && p.up,
  );
  return bullSeesBear && bearSeesBull;
}

async function ensureMesh(): Promise<void> {
  if (await meshIsReady()) {
    console.error(`${DIM}[orchestrator] AXL mesh already up + peering ✓${RESET}`);
    return;
  }
  console.error(`[orchestrator] mesh not ready — starting via axl/scripts/start-mesh.sh`);
  const start = spawn("bash", [resolve(REPO_ROOT, "axl/scripts/start-mesh.sh")], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  await new Promise<void>((res, rej) => {
    start.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`start-mesh.sh exited ${code}`)),
    );
  });
  for (let i = 0; i < 30; i++) {
    await sleep(1_000);
    if (await meshIsReady()) {
      console.error(`${DIM}[orchestrator] mesh ready after ${i + 1}s ✓${RESET}`);
      return;
    }
  }
  throw new Error(
    `mesh failed to become ready within 30s. Check axl/logs/node-1.log and node-2.log`,
  );
}

/* ---------------- agent spawn + stderr streaming ---------------- */

function streamStderr(child: ChildProcess, prefix: string, color: string): void {
  if (!child.stderr) return;
  let buf = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      process.stderr.write(`${color}${prefix}${RESET} ${line}\n`);
    }
  });
  child.stderr.on("end", () => {
    if (buf.length > 0) process.stderr.write(`${color}${prefix}${RESET} ${buf}\n`);
  });
}

interface SpawnedAgent {
  child: ChildProcess;
  exited: Promise<number>;
}

function spawnAgent(role: "bull" | "bear", marketId: string, color: string): SpawnedAgent {
  const indexPath = resolve(REPO_ROOT, "agents", role, "index.ts");
  const child = spawn("pnpm", ["exec", "tsx", indexPath, marketId], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  streamStderr(child, `[${role}]`, color);
  // stdout is unused; drain to avoid backpressure.
  child.stdout?.resume();
  const exited = new Promise<number>((res) => {
    child.on("exit", (code) => res(code ?? -1));
  });
  return { child, exited };
}

/* ---------------- summary ---------------- */

interface SummaryRow {
  round: number;
  role: "bull" | "bear";
  probability: number;
  message_to_peer: string;
  is_final: number;
}

function summarize(marketId: string, marketQuestion: string): boolean {
  const dbPath = process.env.DELPHI_DUEL_DB ?? DEFAULT_DB_PATH;
  const raw = new Database(dbPath, { readonly: true });
  try {
    const latest = raw
      .prepare(
        "SELECT duel_id FROM turns WHERE market_id = ? ORDER BY produced_at DESC LIMIT 1",
      )
      .get(marketId) as { duel_id?: string } | undefined;
    if (!latest?.duel_id) {
      console.error(
        `${RED}[orchestrator] no rows in data.db for market ${marketId} — agents likely failed before writing${RESET}`,
      );
      return false;
    }
    const duelId = latest.duel_id;
    const turns = raw
      .prepare(
        "SELECT round, role, probability, message_to_peer, is_final FROM turns WHERE duel_id = ? ORDER BY round ASC",
      )
      .all(duelId) as SummaryRow[];

    const bullTurns = turns.filter((t) => t.role === "bull");
    const bearTurns = turns.filter((t) => t.role === "bear");

    const bullOpen = bullTurns[0]?.probability;
    const bullFinal = bullTurns[bullTurns.length - 1]?.probability;
    const bearOpen = bearTurns[0]?.probability;
    const bearFinal = bearTurns[bearTurns.length - 1]?.probability;
    const bullMove =
      bullOpen != null && bullFinal != null ? bullFinal - bullOpen : 0;
    const bearMove =
      bearOpen != null && bearFinal != null ? bearFinal - bearOpen : 0;
    const biggerMover =
      Math.abs(bullMove) > Math.abs(bearMove)
        ? "bull"
        : Math.abs(bearMove) > Math.abs(bullMove)
          ? "bear"
          : "neither";

    const fmt = (n: number | undefined) => (n == null ? "—" : n.toFixed(3));
    const fmtMove = (n: number) =>
      n === 0 ? "±0.000" : (n > 0 ? "+" : "") + n.toFixed(3);

    console.error("");
    console.error(`${BOLD}═════════════════ DUEL SUMMARY ═════════════════${RESET}`);
    console.error(`${BOLD}  market${RESET}    ${marketId}`);
    console.error(`${BOLD}  duel_id${RESET}   ${duelId}`);
    console.error(`${BOLD}  question${RESET}  ${marketQuestion}`);
    console.error(`${BOLD}  rounds${RESET}    ${turns.length} total (bull ${bullTurns.length}, bear ${bearTurns.length})`);
    console.error("");
    console.error(
      `  ${GREEN}${BOLD}bull${RESET}    open ${fmt(bullOpen)}   final ${fmt(bullFinal)}   move ${fmtMove(bullMove)}`,
    );
    console.error(
      `  ${RED}${BOLD}bear${RESET}    open ${fmt(bearOpen)}   final ${fmt(bearFinal)}   move ${fmtMove(bearMove)}`,
    );
    console.error("");
    if (biggerMover === "neither") {
      console.error(`  ${DIM}neither agent moved more than the other${RESET}`);
    } else {
      const moverColor = biggerMover === "bull" ? GREEN : RED;
      const moveAmt = biggerMover === "bull" ? bullMove : bearMove;
      const conceded = biggerMover === "bull" ? "Bear" : "Bull";
      console.error(
        `  ${moverColor}${BOLD}${biggerMover}${RESET} moved more (${fmtMove(moveAmt)}) — ${conceded}'s argument was more decisive`,
      );
    }
    if (bullFinal != null && bearFinal != null) {
      console.error(
        `  ${BOLD}final disagreement${RESET}  ${(bullFinal - bearFinal).toFixed(3)} (bull − bear)`,
      );
    }
    console.error(`${BOLD}═════════════════════════════════════════════════${RESET}`);

    return turns.length > 0;
  } finally {
    raw.close();
  }
}

/* ---------------- main ---------------- */

async function main(): Promise<void> {
  const marketId = pickMarketId(process.argv[2]);

  console.error(`${BOLD}[orchestrator]${RESET} duel target: ${marketId}`);
  const bullOutcome = process.env.DELPHI_BULL_OUTCOME;
  const bearOutcome = process.env.DELPHI_BEAR_OUTCOME;
  if (bullOutcome && bearOutcome) {
    console.error(
      `${BOLD}[orchestrator]${RESET} mode: outcome head-to-head — ${GREEN}${bullOutcome}${RESET} vs ${RED}${bearOutcome}${RESET}`,
    );
  } else {
    console.error(`${DIM}[orchestrator] mode: binary YES/NO${RESET}`);
  }
  await ensureMesh();

  console.error(`${DIM}[orchestrator] fetching market metadata...${RESET}`);
  const market = await fetchMarket(marketId);
  const question =
    market.prompt.split("\n").find((l) => l.trim().length > 0) ?? "(no question)";
  console.error(
    `${DIM}[orchestrator] market: "${question}" (${market.outcomes.length} outcomes)${RESET}`,
  );

  console.error("");
  console.error(`${BOLD}[orchestrator]${RESET} spawning bear...`);
  const bear = spawnAgent("bear", marketId, RED);

  await sleep(1_000);

  console.error(`${BOLD}[orchestrator]${RESET} spawning bull...`);
  const bull = spawnAgent("bull", marketId, GREEN);
  console.error("");

  // SIGINT: SIGTERM children once; SIGKILL on second ctrl+c.
  let interrupted = false;
  const onSigint = () => {
    if (interrupted) {
      bear.child.kill("SIGKILL");
      bull.child.kill("SIGKILL");
      console.error(`\n${RED}[orchestrator] hard kill — exiting${RESET}`);
      process.exit(130);
    }
    interrupted = true;
    console.error(
      `\n${RED}[orchestrator] SIGINT — terminating agents (ctrl+c again to force)${RESET}`,
    );
    bear.child.kill("SIGTERM");
    bull.child.kill("SIGTERM");
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigint);

  const [bearExit, bullExit] = await Promise.all([bear.exited, bull.exited]);
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigint);

  console.error("");
  console.error(
    `${DIM}[orchestrator] bear exit=${bearExit}, bull exit=${bullExit}${RESET}`,
  );

  if (interrupted) {
    console.error(`${RED}[orchestrator] duel was interrupted; skipping summary${RESET}`);
    process.exit(130);
  }
  if (bullExit !== 0 || bearExit !== 0) {
    console.error(
      `${RED}[orchestrator] one or both agents exited non-zero; summary may be incomplete${RESET}`,
    );
  }

  const ok = summarize(marketId, question);
  process.exit(bullExit === 0 && bearExit === 0 && ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`${RED}[orchestrator] FAIL:${RESET}`, err?.message ?? err);
  if (process.env.DEBUG) console.error(err?.stack ?? "");
  process.exit(1);
});
