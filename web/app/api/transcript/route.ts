/**
 * GET /api/transcript?duel_id=<uuid>
 *
 * Returns all turns for the given duel_id, ordered by round.
 * is_final is normalized from SQLite's INTEGER 0/1 to a boolean.
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  duel_id: string;
  round: number;
  role: "bull" | "bear";
  market_id: string;
  champion_outcome_idx: number;
  probability: number;
  confidence: number;
  reasoning: string;
  message_to_peer: string;
  is_final: number;
  produced_at: string;
  bull_outcome: string | null;
  bear_outcome: string | null;
}

function dbPath(): string {
  // app/api/transcript/route.ts → cwd is web/ → repo-root is one level up
  return process.env.DELPHI_DUEL_DB ?? resolve(process.cwd(), "..", "data.db");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const duelId = url.searchParams.get("duel_id");
  if (!duelId) {
    return Response.json(
      { error: "duel_id query param required" },
      { status: 400 },
    );
  }

  const db = new Database(dbPath(), { readonly: true, fileMustExist: false });
  try {
    const rows = db
      .prepare(
        `SELECT duel_id, round, role, market_id, champion_outcome_idx,
                probability, confidence, reasoning, message_to_peer,
                is_final, produced_at, bull_outcome, bear_outcome
         FROM turns WHERE duel_id = ? ORDER BY round ASC`,
      )
      .all(duelId) as Row[];

    const turns = rows.map((r) => ({
      ...r,
      is_final: Boolean(r.is_final),
      // Strip null outcome fields so the client treats them as undefined
      // (matches the optional-prop semantics on TurnRecord).
      ...(r.bull_outcome ? { bull_outcome: r.bull_outcome } : { bull_outcome: undefined }),
      ...(r.bear_outcome ? { bear_outcome: r.bear_outcome } : { bear_outcome: undefined }),
    }));

    return Response.json({ duel_id: duelId, turns });
  } catch (err) {
    // data.db may not exist yet (no duel ever run). Treat as empty.
    if ((err as NodeJS.ErrnoException).code === "SQLITE_CANTOPEN") {
      return Response.json({ duel_id: duelId, turns: [] });
    }
    throw err;
  } finally {
    db.close();
  }
}
