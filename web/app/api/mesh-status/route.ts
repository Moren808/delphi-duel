/**
 * GET /api/mesh-status
 *
 * Probes both AXL HTTP bridges (bull on 9002, bear on 9012) for /topology.
 * Returns { bull, bear } booleans + the peer up-state if reachable.
 *
 * Used by the dashboard's mesh status indicator (poll every 5s).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BULL_API = "http://127.0.0.1:9002";
const BEAR_API = "http://127.0.0.1:9012";

interface Topology {
  our_public_key: string;
  peers: Array<{ public_key: string; up: boolean }>;
}

async function probe(api: string, otherApi: string) {
  try {
    const res = await fetch(`${api}/topology`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return { reachable: false as const };
    const topo = (await res.json()) as Topology;
    // Best-effort peering check: are we talking to the other expected node?
    let peering: boolean | null = null;
    try {
      const otherRes = await fetch(`${otherApi}/topology`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      if (otherRes.ok) {
        const otherTopo = (await otherRes.json()) as Topology;
        peering = topo.peers.some(
          (p) => p.public_key === otherTopo.our_public_key && p.up,
        );
      }
    } catch {
      peering = null;
    }
    return { reachable: true as const, public_key: topo.our_public_key, peering };
  } catch {
    return { reachable: false as const };
  }
}

export async function GET(): Promise<Response> {
  const [bull, bear] = await Promise.all([
    probe(BULL_API, BEAR_API),
    probe(BEAR_API, BULL_API),
  ]);
  return Response.json({
    bull: bull.reachable,
    bear: bear.reachable,
    detail: { bull, bear },
  });
}
