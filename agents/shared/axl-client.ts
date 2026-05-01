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

/**
 * Send a payload to a peer via the local AXL node's HTTP bridge.
 *
 * **AXL endpoint:** `POST http://127.0.0.1:<apiPort>/send`
 *
 * **Request:**
 * - Header `X-Destination-Peer-Id: <full ed25519 pubkey hex>` — the
 *   destination is identified by its FULL 64-char public key, not by
 *   the lossy IPv6-derived `axl_peer_id` you see on /recv.
 * - Header `Content-Type: application/octet-stream`.
 * - Body: arbitrary bytes (`string` or `Uint8Array`). We use UTF-8
 *   JSON by convention (TurnRecord, DuelTranscript, DuelVerdict).
 *
 * **Response:**
 * - `200 OK` (no body) on success — fire-and-forget; AXL queues at
 *   the receiver. There is NO acknowledgment that the peer actually
 *   read it; that's what the receiver's `/recv` polling provides.
 * - `4xx` on validation failure (e.g. malformed `X-Destination-Peer-Id`).
 * - `5xx` on transient routing failure (e.g. peer not yet in the
 *   Yggdrasil tree). We retry these.
 *
 * **Retry behaviour:** exponential backoff (default 200ms → 400ms →
 * 800ms → ... cap 2s) until `opts.timeoutMs` (default 10s) elapses.
 * 4xx fails fast; 5xx is treated as transient.
 *
 * @param apiPort     Port of THIS process's AXL HTTP bridge (e.g. 9002 for bull).
 * @param peerPubKey  Destination's full ed25519 public key (hex, no `0x`).
 * @param payload     Bytes to send (string is UTF-8-encoded).
 * @param opts.timeoutMs        Max total wall-clock for the call. Default 10_000.
 * @param opts.initialBackoffMs Starting backoff. Default 200.
 *
 * @throws Error on 4xx (fail-fast) or after `timeoutMs` of 5xx retries.
 */
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

/**
 * Pull one message from the local AXL node's inbound queue.
 *
 * **AXL endpoint:** `GET http://127.0.0.1:<apiPort>/recv`
 *
 * **Response:**
 * - `204 No Content` — queue is empty (most polls). Returns `null`.
 * - `200 OK` with body bytes + header `X-From-Peer-Id: <axl-derived
 *   sender id>`. The body is whatever the sender passed to `/send`;
 *   we treat it as UTF-8.
 * - 4xx/5xx — unexpected; thrown.
 *
 * **About `X-From-Peer-Id`:** AXL derives this from the sender's
 * Yggdrasil IPv6 address, which is a one-way lossy hash of the
 * sender's full ed25519 public key. So `fromPeerId` is NOT equal to
 * the sender's pubkey — only the first ~28 hex chars share a prefix
 * with the pubkey, the rest is `f`-padded by Yggdrasil's address
 * scheme. Compare against the peer's recorded `axl_peer_id` from
 * `axl/keys/public-keys.json` (which we capture once at startup with
 * a probe round-trip), not against their `pubkey`.
 *
 * Each successful `/recv` removes the message from the queue —
 * subsequent polls see the next message (or 204 when empty).
 *
 * @param apiPort Port of THIS process's AXL HTTP bridge.
 * @returns The next message as `{body, fromPeerId}`, or `null` if
 *          the queue is empty right now.
 *
 * @throws Error on 4xx/5xx HTTP failures (network blips, AXL down).
 */
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
 * Polling helper around {@link recv}. Calls /recv repeatedly until
 * either a message arrives (returns it) or `timeoutMs` elapses
 * (throws). Sleeps `intervalMs` between empty (204) polls so we don't
 * busy-loop the local HTTP bridge.
 *
 * **AXL endpoint:** `GET http://127.0.0.1:<apiPort>/recv` — same as
 * {@link recv}, called repeatedly.
 *
 * **Use this instead of a hand-rolled poll loop** in any code path
 * that's expecting a message to arrive (e.g. bear waiting for bull's
 * opening, judge waiting for a transcript). Don't use it for "is
 * anything queued right now?" — use `recv()` directly.
 *
 * @param apiPort     Port of THIS process's AXL HTTP bridge.
 * @param timeoutMs   Total wait budget. Default 120_000 (2 min).
 * @param intervalMs  Sleep between empty polls. Default 500 ms.
 * @returns The first non-204 message that arrives.
 * @throws Error if no message arrives within `timeoutMs`.
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

/**
 * Drain everything currently queued on /recv. Call at duel startup so
 * a stale message from a prior run can't be mistaken for the current
 * peer's first turn.
 *
 * **AXL endpoint:** `GET /recv` repeatedly until 204 (empty).
 *
 * @param apiPort  Port of THIS process's AXL HTTP bridge.
 * @param maxIters Safety cap on iterations. Default 100.
 * @returns Number of messages drained (0 if the queue was already empty).
 */
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

/**
 * Read THIS node's view of the AXL mesh — its own pubkey, its
 * Yggdrasil IPv6, and the list of currently-connected peers.
 *
 * **AXL endpoint:** `GET http://127.0.0.1:<apiPort>/topology`
 *
 * **Response shape (JSON):**
 * ```ts
 * {
 *   our_ipv6: string,        // Yggdrasil IPv6 derived from our pubkey
 *   our_public_key: string,  // 64-char hex of our ed25519 pubkey
 *   peers: Array<{
 *     uri: string,           // e.g. "tls://127.0.0.1:9001"
 *     up: boolean,           // true = TLS handshake complete
 *     inbound: boolean,      // true = peer dialed us; false = we dialed them
 *     public_key: string,    // peer's full ed25519 pubkey hex
 *     root: string,
 *     port: number,
 *     coords: unknown,
 *   }>,
 *   tree: unknown[],         // Yggdrasil routing tree state (informational)
 * }
 * ```
 *
 * **Used at:**
 * - Agent startup — confirm `our_public_key` matches what
 *   `axl/keys/public-keys.json` says we should be (fails fast if
 *   we accidentally picked up a wrong identity key).
 * - Web UI mesh status indicator — polled every 5s to render the
 *   bull/bear/judge dot pills and the "PEERED" badge.
 * - `pnpm axl:probe` — captures every node's pubkey + does a
 *   round-trip /send to learn each `axl_peer_id`.
 *
 * @param apiPort Port of the AXL HTTP bridge to query.
 * @throws Error on non-2xx HTTP failure.
 */
export async function getTopology(apiPort: number): Promise<Topology> {
  const res = await fetch(`${DEFAULT_BASE(apiPort)}/topology`);
  if (!res.ok) throw new Error(`topology failed: ${res.status}`);
  return (await res.json()) as Topology;
}

/* ---------------------------------------------------------------- utils */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
