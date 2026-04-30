/**
 * GET /api/verdict?duel_id=<uuid>
 *
 * Returns the judge's verdict row for the given duel, or null if
 * the judge hasn't produced one yet (still polling, or judge not
 * running). Reads directly from the SQLite verdicts table.
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  duel_id: string;
  market_id: string;
  winner: "bull" | "bear" | "inconclusive";
  confidence: number;
  reasoning: string;
  suggested_lean: string;
  recommended_position: string;
  produced_at: string;
}

function dbPath(): string {
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
    const row = db
      .prepare(
        `SELECT duel_id, market_id, winner, confidence, reasoning,
                suggested_lean, recommended_position, produced_at
         FROM verdicts WHERE duel_id = ?`,
      )
      .get(duelId) as Row | undefined;
    return Response.json({ duel_id: duelId, verdict: row ?? null });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "SQLITE_CANTOPEN") {
      return Response.json({ duel_id: duelId, verdict: null });
    }
    // Table may not exist yet (judge has never run). Treat as no verdict.
    if ((err as Error).message?.includes("no such table")) {
      return Response.json({ duel_id: duelId, verdict: null });
    }
    throw err;
  } finally {
    db.close();
  }
}
