/**
 * Phase 6 — Shared duel loop for bull and bear.
 *
 * The loop:
 *   • drain any leftover messages on our /recv queue
 *   • bull opens with round 0 (sends, persists)
 *   • alternate: poll /recv → parse peer's TurnRecord → persist → produce
 *     our turn via runTurn() → /send to peer → persist
 *   • exit after producing our share of turns (ceil for bull, floor for bear)
 *
 * Identity: the peer's full ed25519 pubkey is the destination header on
 * /send; on /recv we compare X-From-Peer-Id against the peer's recorded
 * axl_peer_id. Mismatch logs a warning but does not abort (Phase 6 is
 * about transport correctness, not auth).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { fetchMarket } from "@delphi-duel/sdk";
import {
  send,
  recvWait,
  drainRecv,
  getTopology,
} from "./axl-client.js";
import { TurnRecordSchema, type TurnRecord, type AgentRole } from "./protocol.js";
import { runTurn } from "./debate-engine.js";
import { openDb, DEFAULT_DB_PATH, type DuelDb } from "./storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PeerKeysFile {
  bull: { pubkey: string; axl_peer_id: string };
  bear: { pubkey: string; axl_peer_id: string };
}

/** Default port map per CLAUDE.md. */
const API_PORTS: Record<AgentRole, number> = { bull: 9002, bear: 9012 };

function loadPeerKeys(): PeerKeysFile {
  const path = resolve(__dirname, "..", "..", "axl", "keys", "public-keys.json");
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as PeerKeysFile;
}

function logTurn(prefix: string, t: TurnRecord): void {
  // stderr so stdout stays free for any future tooling that wants raw output
  console.error(
    `[${prefix}] r${t.round} ${t.role} p=${t.probability.toFixed(3)} ` +
      `c=${t.confidence.toFixed(2)}${t.is_final ? " (final)" : ""}`,
  );
  console.error(`        peer-msg: ${truncate(t.message_to_peer, 200)}`);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export interface RunAgentOptions {
  role: AgentRole;
  marketId: string;
  /** Total turns across both agents. Default 4 (bull does 2, bear does 2). */
  totalTurns?: number;
  /** Path to the SQLite db. Defaults to repo-root/data.db. */
  dbPath?: string;
  /** Champion outcome to defend (for multi-outcome markets). Default 0. */
  championOutcomeIdx?: number;
}

export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const role = opts.role;
  const peerRoleName: AgentRole = role === "bull" ? "bear" : "bull";
  const marketId = opts.marketId;
  const totalTurns = opts.totalTurns ?? Number(process.env.DELPHI_DUEL_TURNS ?? 4);
  const championIdx = opts.championOutcomeIdx ?? 0;
  const ourApiPort = API_PORTS[role];

  const peerKeys = loadPeerKeys();
  const peerPubkey = peerKeys[peerRoleName].pubkey;
  const peerAxlId = peerKeys[peerRoleName].axl_peer_id;
  const ourPubkey = peerKeys[role].pubkey;

  // Sanity: confirm our AXL node is up and reports the pubkey we expect.
  const topo = await getTopology(ourApiPort);
  if (topo.our_public_key !== ourPubkey) {
    throw new Error(
      `AXL node on :${ourApiPort} reports public_key ${topo.our_public_key} ` +
        `but public-keys.json says ${role}=${ourPubkey}. Re-run pnpm axl:probe?`,
    );
  }
  const peerSeen = topo.peers.find((p) => p.public_key === peerPubkey);
  if (!peerSeen) {
    console.error(
      `[${role}] WARN: peer ${peerPubkey.slice(0, 12)}… not in /topology peers list yet`,
    );
  } else {
    console.error(
      `[${role}] peer up=${peerSeen.up} inbound=${peerSeen.inbound} (${peerSeen.uri})`,
    );
  }

  const dbPath = opts.dbPath ?? process.env.DELPHI_DUEL_DB ?? DEFAULT_DB_PATH;
  const db: DuelDb = openDb(dbPath);
  console.error(`[${role}] db: ${db.path}`);

  // myMaxTurns: bull gets the ceiling (it opens), bear gets the floor.
  const myMaxTurns =
    role === "bull"
      ? Math.ceil(totalTurns / 2)
      : Math.floor(totalTurns / 2);
  if (myMaxTurns <= 0) {
    console.error(`[${role}] totalTurns=${totalTurns} → nothing to do, exiting`);
    db.close();
    return;
  }
  console.error(
    `[${role}] starting duel: totalTurns=${totalTurns}, myMaxTurns=${myMaxTurns}, market=${marketId}`,
  );

  const market = await fetchMarket(marketId);
  console.error(
    `[${role}] market loaded: ${market.outcomes.length} outcomes, ` +
      `implied P(${market.outcomes[championIdx]}) = ` +
      `${market.implied_probabilities[championIdx]?.toFixed(3) ?? "?"}`,
  );

  // Drain any stale messages from a prior duel.
  const drained = await drainRecv(ourApiPort);
  if (drained > 0) console.error(`[${role}] drained ${drained} stale recv message(s)`);

  let myTurnsDone = 0;
  let lastSelfMessage: string | null = null;
  let duelId: string | null = null;

  // --- bull opens at round 0 ---
  if (role === "bull") {
    // The orchestrator (or web API) can pre-mint a UUID so it knows
    // the duel_id before bull starts. Falling back to randomUUID() keeps
    // the CLI flow (pnpm dev:bull) working with no env.
    duelId = process.env.DELPHI_DUEL_ID || randomUUID();
    const isFinal = myMaxTurns === 1;
    console.error(`[${role}] opening duel ${duelId} (round 0)`);
    const turn0 = await runTurn({
      duel_id: duelId,
      role,
      market,
      champion_outcome_idx: championIdx,
      round: 0,
      peerLastMessage: null,
      is_final: isFinal,
    });
    db.insertTurn(turn0);
    logTurn(role, turn0);
    await send(ourApiPort, peerPubkey, JSON.stringify(turn0));
    console.error(`[${role}] sent r${turn0.round} → bear (${turn0.message_to_peer.length} chars)`);
    lastSelfMessage = turn0.message_to_peer;
    myTurnsDone = 1;
    if (isFinal) {
      db.close();
      return;
    }
  }

  // --- main loop ---
  while (myTurnsDone < myMaxTurns) {
    console.error(`[${role}] waiting for ${peerRoleName}'s turn...`);
    const incoming = await recvWait(ourApiPort);
    if (incoming.fromPeerId !== peerAxlId) {
      console.error(
        `[${role}] WARN: X-From-Peer-Id ${incoming.fromPeerId.slice(0, 16)}… ` +
          `!= expected ${peerAxlId.slice(0, 16)}…`,
      );
    }

    let peerTurn: TurnRecord;
    try {
      peerTurn = TurnRecordSchema.parse(JSON.parse(incoming.body));
    } catch (err) {
      console.error(`[${role}] FATAL: peer sent malformed TurnRecord: ${(err as Error).message}`);
      console.error(`[${role}] raw body: ${truncate(incoming.body, 400)}`);
      throw err;
    }

    if (peerTurn.role !== peerRoleName) {
      throw new Error(`expected peer.role=${peerRoleName}, got ${peerTurn.role}`);
    }
    if (peerTurn.market_id !== marketId) {
      throw new Error(
        `peer.market_id=${peerTurn.market_id} != argv market ${marketId}`,
      );
    }

    if (!duelId) duelId = peerTurn.duel_id;
    if (peerTurn.duel_id !== duelId) {
      throw new Error(
        `duel_id drift: peer says ${peerTurn.duel_id}, we have ${duelId}`,
      );
    }

    db.insertTurn(peerTurn);
    logTurn(role, peerTurn);

    // Are we about to produce our last turn?
    const myIsFinal = myTurnsDone + 1 === myMaxTurns;
    const myRound = peerTurn.round + 1;

    const myTurn = await runTurn({
      duel_id: duelId,
      role,
      market,
      champion_outcome_idx: championIdx,
      round: myRound,
      peerLastMessage: peerTurn.message_to_peer,
      selfLastMessage: lastSelfMessage,
      is_final: myIsFinal,
    });
    db.insertTurn(myTurn);
    logTurn(role, myTurn);
    await send(ourApiPort, peerPubkey, JSON.stringify(myTurn));
    console.error(
      `[${role}] sent r${myTurn.round} → ${peerRoleName} ` +
        `(${myTurn.message_to_peer.length} chars)${myIsFinal ? " [final]" : ""}`,
    );
    lastSelfMessage = myTurn.message_to_peer;
    myTurnsDone++;

    // If the peer just sent their final turn, we've now responded; we're done
    // regardless of myMaxTurns (in case totalTurns is configured asymmetric).
    if (peerTurn.is_final) {
      console.error(`[${role}] peer marked is_final — duel complete`);
      break;
    }
  }

  console.error(`[${role}] duel ${duelId} complete (${myTurnsDone} turn(s) produced)`);
  db.close();
}
