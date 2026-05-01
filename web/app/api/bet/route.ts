/**
 * GET /api/bet?duel_id=<uuid>
 *
 * Returns the judge's autonomous-betting row for the given duel, or
 * null if the judge hasn't reached the betting branch yet (still
 * deliberating, AUTO_BET disabled and the row hasn't been written, or
 * judge not running). Reads directly from the SQLite bets table.
 *
 * Also exposes server-side env so the client knows whether to render
 * the bets panel at all (`auto_bet_enabled`) and how to build the
 * explorer link (`network`).
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

  const autoBetEnabled = process.env.AUTO_BET === "true";
  const network = process.env.DELPHI_NETWORK ?? "testnet";

  const db = new Database(dbPath(), { readonly: true, fileMustExist: false });
  try {
    const row = db
      .prepare(
        `SELECT duel_id, market_id, outcome_index, amount_usdc, tx_hash,
                status, error, timestamp
         FROM bets WHERE duel_id = ?`,
      )
      .get(duelId) as Row | undefined;
    return Response.json({
      duel_id: duelId,
      bet: row ?? null,
      auto_bet_enabled: autoBetEnabled,
      network,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "SQLITE_CANTOPEN") {
      return Response.json({
        duel_id: duelId,
        bet: null,
        auto_bet_enabled: autoBetEnabled,
        network,
      });
    }
    // Table may not exist yet (judge has never run with AUTO_BET on).
    if ((err as Error).message?.includes("no such table")) {
      return Response.json({
        duel_id: duelId,
        bet: null,
        auto_bet_enabled: autoBetEnabled,
        network,
      });
    }
    throw err;
  } finally {
    db.close();
  }
}
