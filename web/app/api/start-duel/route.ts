/**
 * POST /api/start-duel  body { market_id: string }
 * GET  /api/start-duel  returns the active duel, if any
 *
 * Spawns scripts/run-duel.ts. The API pre-mints a duel_id UUID and
 * passes it through DELPHI_DUEL_ID env, so we can return the id to the
 * client immediately (before bull has produced round 0).
 *
 * In-memory single-duel guard: returns 409 if a duel is already running.
 * Both agents share AXL ports, so concurrent duels would interleave.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ActiveDuel {
  duel_id: string;
  market_id: string;
  child: ChildProcess;
  started_at: string;
}

// Module state must live on globalThis or Next.js dev re-evaluates the
// module per-request and the singleton resets. Survives across GET/POST
// in the same dev session; resets on full server restart.
const STATE_KEY = "__delphi_duel_active";
type StateHolder = { current: ActiveDuel | null };
function holder(): StateHolder {
  const g = globalThis as unknown as Record<string, StateHolder>;
  if (!g[STATE_KEY]) g[STATE_KEY] = { current: null };
  return g[STATE_KEY];
}
function getActive(): ActiveDuel | null {
  return holder().current;
}
function setActive(v: ActiveDuel | null): void {
  holder().current = v;
}

function repoRoot(): string {
  return resolve(process.cwd(), "..");
}

export async function GET(): Promise<Response> {
  const active = getActive();
  return Response.json({
    active: active
      ? {
          duel_id: active.duel_id,
          market_id: active.market_id,
          started_at: active.started_at,
          alive: active.child.exitCode == null,
        }
      : null,
  });
}

export async function POST(req: Request): Promise<Response> {
  const existing = getActive();
  if (existing && existing.child.exitCode == null) {
    return Response.json(
      {
        error: "duel already running",
        active: { duel_id: existing.duel_id, market_id: existing.market_id },
      },
      { status: 409 },
    );
  }

  let body: { market_id?: string };
  try {
    body = (await req.json()) as { market_id?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const marketId = body.market_id;
  if (!marketId || typeof marketId !== "string") {
    return Response.json(
      { error: "market_id (string) is required" },
      { status: 400 },
    );
  }

  const duelId = randomUUID();
  const root = repoRoot();
  const runDuelPath = resolve(root, "scripts/run-duel.ts");

  const child = spawn("pnpm", ["exec", "tsx", runDuelPath, marketId], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DELPHI_DUEL_ID: duelId },
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[duel ${duelId.slice(0, 8)}] ${chunk}`);
  });
  child.stdout?.resume();

  const startedAt = new Date().toISOString();
  setActive({
    duel_id: duelId,
    market_id: marketId,
    child,
    started_at: startedAt,
  });

  child.on("exit", (code) => {
    process.stderr.write(
      `[duel ${duelId.slice(0, 8)}] orchestrator exited with code ${code}\n`,
    );
    const cur = getActive();
    if (cur?.duel_id === duelId) setActive(null);
  });

  return Response.json({
    duel_id: duelId,
    market_id: marketId,
    started_at: startedAt,
  });
}
