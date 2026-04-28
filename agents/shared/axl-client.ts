/**
 * Phase 6 — HTTP wrapper around the local AXL node.
 *
 * Three primitives:
 *   send(apiPort, peerPubKey, payload)        — POST /send
 *   recv(apiPort)                              — GET  /recv (single poll, 204=empty)
 *   getTopology(apiPort)                       — GET  /topology
 *
 * Plus one helper: recvWait() polls /recv on an interval until a message
 * arrives or the timeout elapses. Send is retried with backoff because a
 * peer that's just come up may briefly fail to dial through the mesh.
 */

export interface RecvResult {
  /** Message body as a UTF-8 string. AXL is byte-oriented; we use UTF-8 by convention. */
  body: string;
  /**
   * AXL-derived peer ID of the sender. NOT equal to the sender's full
   * ed25519 pubkey — see AGENTS.md "Things that have burned us." Compare
   * against the peer's recorded `axl_peer_id` from public-keys.json.
   */
  fromPeerId: string;
}

export interface Peer {
  uri: string;
  up: boolean;
  inbound: boolean;
  public_key: string;
  root: string;
  port: number;
  coords: unknown;
}

export interface Topology {
  our_ipv6: string;
  our_public_key: string;
  peers: Peer[];
  tree: unknown[];
}

const DEFAULT_BASE = (apiPort: number) => `http://127.0.0.1:${apiPort}`;

/* ---------------------------------------------------------------- send */

export interface SendOptions {
  /** Total wall-clock budget for retries. Default 10s. */
  timeoutMs?: number;
  /** Initial backoff. Doubles each retry, capped at 2s. Default 200ms. */
  initialBackoffMs?: number;
}

export async function send(
  apiPort: number,
  peerPubKey: string,
  payload: string | Uint8Array,
  opts: SendOptions = {},
): Promise<void> {
  const url = `${DEFAULT_BASE(apiPort)}/send`;
  const body = typeof payload === "string" ? payload : Buffer.from(payload);
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  let backoff = opts.initialBackoffMs ?? 200;
  let lastErr: unknown;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-Destination-Peer-Id": peerPubKey,
          "Content-Type": "application/octet-stream",
        },
        body,
      });
      if (res.ok) return;
      // Some failures are transient (peer not yet routable through the mesh);
      // retry on 5xx, fail fast on 4xx.
      const text = await res.text().catch(() => "");
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`send failed: ${res.status} ${res.statusText} ${text}`);
      }
      lastErr = new Error(`send transient ${res.status}: ${text}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 2_000);
  }
  throw new Error(
    `AXL /send timed out after ${opts.timeoutMs ?? 10_000}ms. last error: ${
      (lastErr as Error)?.message ?? String(lastErr)
    }`,
  );
}

/* ---------------------------------------------------------------- recv */

/** Single poll. Returns null on 204 (empty queue). */
export async function recv(apiPort: number): Promise<RecvResult | null> {
  const res = await fetch(`${DEFAULT_BASE(apiPort)}/recv`);
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new Error(`recv failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  const fromPeerId = res.headers.get("X-From-Peer-Id") ?? "";
  return { body, fromPeerId };
}

/**
 * Poll /recv until a message arrives or the timeout elapses.
 * Throws on timeout.
 */
export async function recvWait(
  apiPort: number,
  timeoutMs = 120_000,
  intervalMs = 500,
): Promise<RecvResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await recv(apiPort);
    if (r) return r;
    await sleep(intervalMs);
  }
  throw new Error(`AXL /recv timed out after ${timeoutMs}ms (no message)`);
}

/** Drain anything currently queued (e.g. leftover from a prior duel). */
export async function drainRecv(apiPort: number, maxIters = 100): Promise<number> {
  let drained = 0;
  for (let i = 0; i < maxIters; i++) {
    const r = await recv(apiPort);
    if (!r) return drained;
    drained++;
  }
  return drained;
}

/* ---------------------------------------------------------------- topology */

export async function getTopology(apiPort: number): Promise<Topology> {
  const res = await fetch(`${DEFAULT_BASE(apiPort)}/topology`);
  if (!res.ok) throw new Error(`topology failed: ${res.status}`);
  return (await res.json()) as Topology;
}

/* ---------------------------------------------------------------- utils */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
