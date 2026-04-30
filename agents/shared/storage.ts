/**
 * Phase 6 — SQLite turn storage.
 *
 * One table: `turns`. Both bull and bear write to the same database file
 * (default: <repo-root>/data.db) from separate processes; SQLite WAL
 * mode handles the concurrent access cleanly.
 *
 * Replays are idempotent: PRIMARY KEY (duel_id, round) + INSERT OR REPLACE
 * means re-running the same turn updates the row in place rather than
 * creating duplicates.
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TurnRecord, VerdictRecord } from "./protocol.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default DB path is repo-root/data.db (agents/shared → up two levels). */
export const DEFAULT_DB_PATH = resolve(__dirname, "..", "..", "data.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS turns (
  duel_id          TEXT    NOT NULL,
  round            INTEGER NOT NULL,
  role             TEXT    NOT NULL CHECK (role IN ('bull','bear')),
  market_id        TEXT    NOT NULL,
  champion_outcome_idx INTEGER NOT NULL DEFAULT 0,
  probability      REAL    NOT NULL,
  confidence       REAL    NOT NULL,
  reasoning        TEXT    NOT NULL,
  message_to_peer  TEXT    NOT NULL,
  is_final         INTEGER NOT NULL DEFAULT 0,
  produced_at      TEXT    NOT NULL,
  inserted_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (duel_id, round)
);

CREATE INDEX IF NOT EXISTS idx_turns_market ON turns(market_id, produced_at);

CREATE TABLE IF NOT EXISTS verdicts (
  duel_id              TEXT    PRIMARY KEY,
  market_id            TEXT    NOT NULL,
  winner               TEXT    NOT NULL CHECK (winner IN ('bull','bear','inconclusive')),
  confidence           REAL    NOT NULL,
  reasoning            TEXT    NOT NULL,
  suggested_lean       TEXT    NOT NULL,
  recommended_position TEXT    NOT NULL,
  produced_at          TEXT    NOT NULL,
  inserted_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verdicts_market ON verdicts(market_id, produced_at);
`;

const INSERT_SQL = `
INSERT OR REPLACE INTO turns (
  duel_id, round, role, market_id, champion_outcome_idx,
  probability, confidence, reasoning, message_to_peer,
  is_final, produced_at
) VALUES (
  @duel_id, @round, @role, @market_id, @champion_outcome_idx,
  @probability, @confidence, @reasoning, @message_to_peer,
  @is_final, @produced_at
)
`;

const INSERT_VERDICT_SQL = `
INSERT OR REPLACE INTO verdicts (
  duel_id, market_id, winner, confidence, reasoning,
  suggested_lean, recommended_position, produced_at
) VALUES (
  @duel_id, @market_id, @winner, @confidence, @reasoning,
  @suggested_lean, @recommended_position, @produced_at
)
`;

export interface DuelDb {
  insertTurn(t: TurnRecord): void;
  listTurns(duelId: string): TurnRecord[];
  insertVerdict(v: VerdictRecord): void;
  getVerdict(duelId: string): VerdictRecord | null;
  close(): void;
  path: string;
}

export function openDb(dbPath: string = DEFAULT_DB_PATH): DuelDb {
  const db: DatabaseType = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA);

  const insertStmt = db.prepare(INSERT_SQL);
  const listStmt = db.prepare(
    "SELECT * FROM turns WHERE duel_id = ? ORDER BY round ASC",
  );
  const insertVerdictStmt = db.prepare(INSERT_VERDICT_SQL);
  const getVerdictStmt = db.prepare(
    "SELECT * FROM verdicts WHERE duel_id = ?",
  );

  return {
    path: dbPath,
    insertTurn(t: TurnRecord): void {
      insertStmt.run({
        duel_id: t.duel_id,
        round: t.round,
        role: t.role,
        market_id: t.market_id,
        champion_outcome_idx: t.champion_outcome_idx,
        probability: t.probability,
        confidence: t.confidence,
        reasoning: t.reasoning,
        message_to_peer: t.message_to_peer,
        is_final: t.is_final ? 1 : 0,
        produced_at: t.produced_at,
      });
    },
    listTurns(duelId: string): TurnRecord[] {
      const rows = listStmt.all(duelId) as Array<Record<string, unknown>>;
      return rows.map(rowToTurn);
    },
    insertVerdict(v: VerdictRecord): void {
      insertVerdictStmt.run({
        duel_id: v.duel_id,
        market_id: v.market_id,
        winner: v.winner,
        confidence: v.confidence,
        reasoning: v.reasoning,
        suggested_lean: v.suggested_lean,
        recommended_position: v.recommended_position,
        produced_at: v.produced_at,
      });
    },
    getVerdict(duelId: string): VerdictRecord | null {
      const row = getVerdictStmt.get(duelId) as
        | Record<string, unknown>
        | undefined;
      return row ? rowToVerdict(row) : null;
    },
    close(): void {
      db.close();
    },
  };
}

function rowToVerdict(r: Record<string, unknown>): VerdictRecord {
  return {
    duel_id: r.duel_id as string,
    market_id: r.market_id as string,
    winner: r.winner as "bull" | "bear" | "inconclusive",
    confidence: r.confidence as number,
    reasoning: r.reasoning as string,
    suggested_lean: r.suggested_lean as
      | "lean YES"
      | "lean NO"
      | "too close to call",
    recommended_position: r.recommended_position as
      | "strong YES"
      | "moderate YES"
      | "neutral"
      | "moderate NO"
      | "strong NO",
    produced_at: r.produced_at as string,
  };
}

function rowToTurn(r: Record<string, unknown>): TurnRecord {
  return {
    duel_id: r.duel_id as string,
    round: r.round as number,
    role: r.role as "bull" | "bear",
    market_id: r.market_id as string,
    champion_outcome_idx: r.champion_outcome_idx as number,
    probability: r.probability as number,
    confidence: r.confidence as number,
    reasoning: r.reasoning as string,
    message_to_peer: r.message_to_peer as string,
    is_final: Boolean(r.is_final),
    produced_at: r.produced_at as string,
  };
}
