/**
 * GET  /api/settings  → current dashboard overrides (or empty object)
 * POST /api/settings  → write { bet_size_usdc?, auto_bet?, min_confidence? }
 *
 * Writes to <repo-root>/settings.json. The judge daemon re-reads that
 * file on every bet attempt, so a write here takes effect on the next
 * duel without restarting the judge.
 *
 * Validation is strict: out-of-range values are rejected with 400.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SettingsOverride {
  bet_size_usdc?: number;
  auto_bet?: boolean;
  min_confidence?: number;
  updated_at?: string;
}

/** Match the bounds advertised in the UI. Out-of-range writes are rejected. */
const BET_MIN = 0.5;
const BET_MAX = 10;
const CONF_MIN = 0.6;
const CONF_MAX = 0.9;

function settingsPath(): string {
  // web/ runs with cwd at the web package root; the file lives at the
  // repo root, one level up. Matches DEFAULT_SETTINGS_PATH in
  // agents/shared/settings-override.ts.
  return process.env.DELPHI_SETTINGS_PATH ?? resolve(process.cwd(), "..", "settings.json");
}

function readSettingsFile(): SettingsOverride {
  const path = settingsPath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ settings: readSettingsFile(), path: settingsPath() });
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const next: SettingsOverride = { ...readSettingsFile() };

  if ("bet_size_usdc" in body) {
    const v = body.bet_size_usdc;
    if (v === null) {
      delete next.bet_size_usdc;
    } else if (typeof v !== "number" || !Number.isFinite(v) || v < BET_MIN || v > BET_MAX) {
      return Response.json(
        { error: `bet_size_usdc must be a number in [${BET_MIN}, ${BET_MAX}] or null to clear` },
        { status: 400 },
      );
    } else {
      next.bet_size_usdc = v;
    }
  }
  if ("auto_bet" in body) {
    const v = body.auto_bet;
    if (v === null) delete next.auto_bet;
    else if (typeof v !== "boolean") {
      return Response.json({ error: "auto_bet must be boolean or null" }, { status: 400 });
    } else {
      next.auto_bet = v;
    }
  }
  if ("min_confidence" in body) {
    const v = body.min_confidence;
    if (v === null) {
      delete next.min_confidence;
    } else if (typeof v !== "number" || !Number.isFinite(v) || v < CONF_MIN || v > CONF_MAX) {
      return Response.json(
        { error: `min_confidence must be a number in [${CONF_MIN}, ${CONF_MAX}] or null to clear` },
        { status: 400 },
      );
    } else {
      next.min_confidence = v;
    }
  }

  next.updated_at = new Date().toISOString();
  try {
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2) + "\n", "utf8");
  } catch (err) {
    return Response.json(
      { error: `failed to write settings: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  return Response.json({ settings: next, path: settingsPath() });
}
