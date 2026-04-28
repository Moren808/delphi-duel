/**
 * Phase 3 — Ping test: bull /send → bear /recv
 *
 * Reads peer keys from axl/keys/public-keys.json, fires a "hello from bull"
 * message via bull's POST /send, polls bear's GET /recv for up to 10s,
 * and verifies the body and X-From-Peer-Id header match.
 *
 * AXL identity note: /send uses the full ed25519 pubkey as
 * X-Destination-Peer-Id, but /recv returns an AXL-derived peer ID
 * (a 64-char hex derived from the sender's Yggdrasil IPv6, which only
 * captures a prefix of the pubkey). Both are stored in public-keys.json
 * — `pubkey` for sending, `axl_peer_id` for verifying received messages.
 *
 * Run with: pnpm test:mesh
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BULL_API = "http://127.0.0.1:9002";
const BEAR_API = "http://127.0.0.1:9012";
const KEYS_PATH = resolve(__dirname, "..", "axl", "keys", "public-keys.json");

const PAYLOAD = "hello from bull";
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 10_000;

type PeerKeys = { pubkey: string; axl_peer_id: string };
type Keys = { bull: PeerKeys; bear: PeerKeys };

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function loadKeys(): Keys {
  let raw: string;
  try {
    raw = readFileSync(KEYS_PATH, "utf8");
  } catch (err) {
    fail(
      `Could not read ${KEYS_PATH}.\n` +
        `Run the topology+probe capture step first so this file exists.\n` +
        `Underlying error: ${(err as Error).message}`,
    );
  }
  const keys = JSON.parse(raw) as Keys;
  for (const role of ["bull", "bear"] as const) {
    const k = keys[role];
    if (!k?.pubkey || !k?.axl_peer_id) {
      fail(`Malformed ${KEYS_PATH}: ${role} must have { pubkey, axl_peer_id }`);
    }
  }
  return keys;
}

async function send(destPubkey: string, body: string): Promise<void> {
  const res = await fetch(`${BULL_API}/send`, {
    method: "POST",
    headers: {
      "X-Destination-Peer-Id": destPubkey,
      "Content-Type": "application/octet-stream",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    fail(
      `bull /send returned ${res.status} ${res.statusText}` +
        (text ? ` — body: ${text}` : ""),
    );
  }
  console.log(
    `  → POST ${BULL_API}/send  (X-Destination-Peer-Id=${destPubkey.slice(0, 12)}…)  ${res.status} OK`,
  );
}

async function pollRecv(): Promise<{ body: string; fromPeerId: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    const res = await fetch(`${BEAR_API}/recv`);
    if (res.status === 200) {
      const body = await res.text();
      const fromPeerId = res.headers.get("X-From-Peer-Id") ?? "";
      console.log(`  ← GET  ${BEAR_API}/recv   200 OK after ${attempts} poll(s)`);
      return { body, fromPeerId };
    }
    if (res.status !== 204) {
      fail(`bear /recv returned unexpected status ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  fail(
    `Timed out waiting for bear to receive the message (${POLL_TIMEOUT_MS}ms, ${attempts} polls).\n` +
      `Check axl/logs/node-1.log and axl/logs/node-2.log for clues.`,
  );
}

// Drain the receive queue so a leftover message from a prior run can't
// cause a false pass.
async function drainRecv(api: string, label: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${api}/recv`);
    if (res.status === 204) return;
    if (res.status === 200) {
      await res.text();
      console.log(`  (drained one stale message from ${label} /recv queue)`);
      continue;
    }
    fail(`Unexpected ${res.status} draining ${label} /recv`);
  }
}

async function main(): Promise<void> {
  const keys = loadKeys();
  console.log("Loaded peer keys:");
  console.log(`  bull pubkey      : ${keys.bull.pubkey}`);
  console.log(`  bull axl_peer_id : ${keys.bull.axl_peer_id}`);
  console.log(`  bear pubkey      : ${keys.bear.pubkey}`);
  console.log(`  bear axl_peer_id : ${keys.bear.axl_peer_id}`);
  console.log("");

  console.log("Draining any stale messages on bear /recv...");
  await drainRecv(BEAR_API, "bear");

  console.log(`Sending ${JSON.stringify(PAYLOAD)} from bull → bear...`);
  await send(keys.bear.pubkey, PAYLOAD);

  console.log("Polling bear /recv...");
  const { body, fromPeerId } = await pollRecv();

  console.log("");
  console.log("Received message:");
  console.log(`  body          : ${JSON.stringify(body)}`);
  console.log(`  X-From-Peer-Id: ${fromPeerId}`);
  console.log("");

  if (body !== PAYLOAD) {
    fail(`Body mismatch. expected ${JSON.stringify(PAYLOAD)}, got ${JSON.stringify(body)}`);
  }
  if (fromPeerId !== keys.bull.axl_peer_id) {
    fail(
      `X-From-Peer-Id mismatch.\n  expected ${keys.bull.axl_peer_id}\n  got      ${fromPeerId}`,
    );
  }

  // Sanity check: the AXL-derived ID's prefix should match bull's pubkey
  // (the ID is derived from the Yggdrasil IPv6, which encodes a pubkey prefix).
  const sharedPrefixLen = [...fromPeerId].findIndex(
    (c, i) => c !== keys.bull.pubkey[i],
  );
  console.log(
    `Prefix match with bull pubkey: ${sharedPrefixLen} hex chars (~${sharedPrefixLen * 4} bits) ✓`,
  );
  console.log("");
  console.log("PASS — bull → bear ping over AXL /send + /recv works.");
}

main().catch((err) => {
  fail(`Unhandled error: ${err?.stack ?? err}`);
});
