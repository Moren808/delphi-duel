/**
 * Phase 13 — Dashboard-driven settings override.
 *
 * The judge daemon reads three runtime knobs from .env.local:
 *   AUTO_BET, BET_SIZE_USDC, plus an internal CONFIDENCE_THRESHOLD.
 *
 * The web dashboard exposes a settings panel that lets the operator
 * override any of these without restarting the judge. Changes are
 * persisted to <repo-root>/settings.json by the /api/settings POST
 * route. The judge re-reads this file on every bet attempt, so a
 * change in the UI takes effect on the next duel.
 *
 * Precedence per field: dashboard override (if set) → env (if set) →
 * hard-coded default.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** <repo-root>/settings.json — sits next to data.db. Gitignored. */
export const DEFAULT_SETTINGS_PATH = resolve(
  __dirname,
  "..",
  "..",
  "settings.json",
);

export interface SettingsOverride {
  bet_size_usdc?: number;
  auto_bet?: boolean;
  /** 0..1 — minimum verdict confidence required to place a bet. */
  min_confidence?: number;
  /** ISO 8601 of the last UI write. Informational. */
  updated_at?: string;
}

/**
 * Read the settings JSON file. Returns an empty object on any failure
 * (missing file, malformed JSON, wrong shape) — the caller falls back
 * to env / hard-coded defaults.
 */
export function loadSettingsOverride(
  path: string = DEFAULT_SETTINGS_PATH,
): SettingsOverride {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const out: SettingsOverride = {};
    if (typeof parsed.bet_size_usdc === "number" && Number.isFinite(parsed.bet_size_usdc)) {
      out.bet_size_usdc = parsed.bet_size_usdc;
    }
    if (typeof parsed.auto_bet === "boolean") out.auto_bet = parsed.auto_bet;
    if (typeof parsed.min_confidence === "number" && Number.isFinite(parsed.min_confidence)) {
      out.min_confidence = parsed.min_confidence;
    }
    if (typeof parsed.updated_at === "string") out.updated_at = parsed.updated_at;
    return out;
  } catch {
    return {};
  }
}
