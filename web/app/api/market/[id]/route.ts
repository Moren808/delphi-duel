/**
 * GET /api/market/<id>
 *
 * Wraps fetchMarket() so the client can render market details (implied
 * probability, outcomes, close date) before any duel runs.
 *
 * In demo mode (no DELPHI_API_ACCESS_KEY), returns 503 — the client
 * has the static demo_pitch from demo-markets.json as fallback.
 */

import { fetchMarket } from "@delphi-duel/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const id = params.id;
  if (!id) {
    return Response.json({ error: "missing market id" }, { status: 400 });
  }

  if (!process.env.DELPHI_API_ACCESS_KEY) {
    return Response.json(
      { error: "DELPHI_API_ACCESS_KEY not configured (demo mode)" },
      { status: 503 },
    );
  }

  try {
    const market = await fetchMarket(id);
    return Response.json({ market });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message || "fetchMarket failed" },
      { status: 502 },
    );
  }
}
