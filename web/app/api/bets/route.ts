/**
 * GET /api/bets
 *
 * Returns ALL bets across all duels, joined with the verdicts table so
 * each row carries the verdict confidence at the time of the bet. Used
 * by the /bets dashboard page (track-record view).
 *
 * Skipped rows are filtered out by default — those are bookkeeping for
 * "would have bet" decisions, not real positions. Pass ?include_skipped=1
 * to see everything.
 *
 * Newest first.
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  duel_id: string;
  market_id: string;
  outcome_index: number;
  amount_usdc: number;
  tx_hash: string | null;
  status: "placed" | "failed" | "skipped";
  error: string | null;
  timestamp: string;
  /** Verdict fields — null when no matching verdict row exists. */
  confidence: number | null;
  recommended_position: string | null;
  winner: string | null;
}

function dbPath(): string {
  return process.env.DELPHI_DUEL_DB ?? resolve(process.cwd(), "..", "data.db");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeSkipped = url.searchParams.get("include_skipped") === "1";
  const network = process.env.DELPHI_NETWORK ?? "testnet";

  const db = new Database(dbPath(), { readonly: true, fileMustExist: false });
  try {
    const sql = `
      SELECT b.duel_id, b.market_id, b.outcome_index, b.amount_usdc,
             b.tx_hash, b.status, b.error, b.timestamp,
             v.confidence, v.recommended_position, v.winner
      FROM bets b
      LEFT JOIN verdicts v ON v.duel_id = b.duel_id
      ${includeSkipped ? "" : "WHERE b.status != 'skipped'"}
      ORDER BY b.timestamp DESC
    `;
    const rows = db.prepare(sql).all() as Row[];
    return Response.json({ bets: rows, network });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "SQLITE_CANTOPEN") {
      return Response.json({ bets: [], network });
    }
    if ((err as Error).message?.includes("no such table")) {
      return Response.json({ bets: [], network });
    }
    throw err;
  } finally {
    db.close();
  }
}
