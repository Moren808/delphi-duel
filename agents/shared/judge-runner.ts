/**
 * Phase 9 — Judge runner.
 *
 * The judge is a long-running daemon that:
 *   • polls /recv on its own AXL bridge (port 9022)
 *   • parses incoming DuelTranscript envelopes
 *   • calls Claude with the judge system prompt + the full transcript
 *   • parses the strict-JSON VerdictPayload, persists to SQLite
 *   • optionally /sends a DuelVerdict envelope back to bull (the
 *     coordinator), so the orchestrator can surface the verdict
 *     immediately rather than polling SQLite
 *
 * Unlike bull and bear, the judge has no notion of "rounds" — it
 * processes each transcript as it arrives and goes back to polling.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { placeBet } from "@delphi-duel/sdk";
import {
  send,
  recvWait,
  drainRecv,
  getTopology,
} from "./axl-client.js";
import {
  DuelTranscriptSchema,
  VerdictPayloadSchema,
  type DuelTranscript,
  type VerdictPayload,
  type VerdictRecord,
  type DuelVerdict,
} from "./protocol.js";
import { openDb, DEFAULT_DB_PATH, type DuelDb, type BetRecord } from "./storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const JUDGE_API_PORT = 9022;
const MODEL = process.env.DELPHI_DUEL_MODEL ?? "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3; // judges should be steadier than agents

interface PeerKeysFile {
  bull: { pubkey: string; axl_peer_id: string };
  bear: { pubkey: string; axl_peer_id: string };
  judge: { pubkey: string; axl_peer_id: string };
}

function loadPeerKeys(): PeerKeysFile {
  const path = resolve(__dirname, "..", "..", "axl", "keys", "public-keys.json");
  return JSON.parse(readFileSync(path, "utf8")) as PeerKeysFile;
}

function loadSystemPrompt(): string {
  return readFileSync(
    resolve(__dirname, "..", "judge", "system-prompt.md"),
    "utf8",
  );
}

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Put it in .env.local at the repo root.",
    );
  }
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

/* ---------- prompt assembly ---------- */

function buildUserPrompt(t: DuelTranscript): string {
  const lines: string[] = [];
  lines.push(`MARKET QUESTION`);
  lines.push(t.market_question);
  lines.push("");
  lines.push(`DUEL TRANSCRIPT (duel_id ${t.duel_id})`);
  for (const turn of t.turns) {
    lines.push("");
    lines.push(
      `── round ${turn.round} — ${turn.role.toUpperCase()} — P(YES)=${turn.probability.toFixed(3)} confidence=${turn.confidence.toFixed(2)}${turn.is_final ? " [final]" : ""} ──`,
    );
    lines.push(`Reasoning (private):`);
    lines.push(turn.reasoning);
    lines.push(`Message to peer:`);
    lines.push(turn.message_to_peer);
  }
  lines.push("");
  lines.push(
    "Return ONLY the JSON verdict object specified in your system prompt. " +
      "No markdown fences, no preamble.",
  );
  return lines.join("\n");
}

function extractJsonObject(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return s;
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getAnthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new Error(`Claude returned no text (stop_reason=${res.stop_reason})`);
  }
  return text;
}

function tryParse(text: string): VerdictPayload | null {
  try {
    const parsed = JSON.parse(extractJsonObject(text));
    const r = VerdictPayloadSchema.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

async function judgeTranscript(t: DuelTranscript): Promise<VerdictPayload> {
  const systemPrompt = loadSystemPrompt();
  const userPrompt = buildUserPrompt(t);

  const text1 = await callClaude(systemPrompt, userPrompt);
  let v = tryParse(text1);
  if (!v) {
    const reminder =
      userPrompt +
      '\n\n[reminder] Output ONLY the JSON verdict object. No markdown, no preamble.';
    const text2 = await callClaude(systemPrompt, reminder);
    v = tryParse(text2);
    if (!v) {
      throw new Error(
        `Failed to parse judge output as VerdictPayload after 2 tries. Last text:\n${text2}`,
      );
    }
  }
  return v;
}

/* ---------- Phase 12: autonomous betting ---------- */

const CONFIDENCE_THRESHOLD = 0.65;

/**
 * Decide whether (and how) to act on a verdict. Returns:
 *   - {skip: true, reason} — judge should not place a bet (low confidence,
 *     neutral recommendation, can't resolve outcome name to index, etc.)
 *   - {skip: false, outcome_index, side} — bet on this outcome.
 */
function decideBet(
  verdict: VerdictRecord,
  envelope: DuelTranscript,
):
  | { skip: true; reason: string }
  | { skip: false; outcome_index: number; side: "YES" | "NO"; outcome_name: string } {
  if (verdict.confidence < CONFIDENCE_THRESHOLD) {
    return {
      skip: true,
      reason: `confidence ${verdict.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD} threshold`,
    };
  }
  const pos = verdict.recommended_position;
  const isYes = /\bYES\b/.test(pos);
  const isNo = /\bNO\b/.test(pos);
  if (!isYes && !isNo) {
    // "neutral"
    return { skip: true, reason: `position "${pos}" is neither YES nor NO` };
  }
  const side: "YES" | "NO" = isYes ? "YES" : "NO";

  // Resolve to an outcome index in the canonical outcomes array.
  // Multi-outcome (head-to-head) markets stamp bull_outcome / bear_outcome
  // on every turn; binary markets fall back to "Yes" / "No" lookups.
  const turn = envelope.turns[0];
  const outcomes = turn ? envelope.turns[0]
    ? // we need the canonical outcomes array; the transcript carries
      // bull_outcome and bear_outcome but not the full outcomes list,
      // so we fall back to inferring from the agent that was assigned.
      // This branch handles outcome mode.
      undefined
    : undefined : undefined;

  const bullOutcome = turn?.bull_outcome;
  const bearOutcome = turn?.bear_outcome;
  const outcomeMode = !!(bullOutcome && bearOutcome);

  let outcome_name: string;
  let outcome_index: number;

  if (outcomeMode) {
    // YES = bet on bull's outcome; NO = bet on bear's outcome.
    outcome_name = side === "YES" ? bullOutcome! : bearOutcome!;
  } else {
    // Binary — bet on the literal "Yes" or "No" outcome label.
    outcome_name = side === "YES" ? "Yes" : "No";
  }

  // Index resolution requires the outcomes list — fetched from the API
  // route or inferred. For binary, "Yes" = index 0, "No" = index 1 by
  // Delphi convention (verified across our demo set).
  // For multi-outcome, the orchestrator passes the names but not the
  // index; we'll let the caller resolve via fetchMarket(market_id).
  // Returning the name + a placeholder index = -1 to signal "look up".
  outcome_index = side === "YES" ? 0 : 1; // binary default
  if (outcomeMode) outcome_index = -1; // caller resolves

  return { skip: false, outcome_index, side, outcome_name };
}

async function attemptAutoBet(
  verdict: VerdictRecord,
  envelope: DuelTranscript,
  db: DuelDb,
): Promise<void> {
  const autoBetEnabled = process.env.AUTO_BET === "true";
  const betSize = Number(process.env.BET_SIZE_USDC ?? "2.50");

  const decision = decideBet(verdict, envelope);
  const now = new Date().toISOString();
  const baseRecord = {
    duel_id: verdict.duel_id,
    market_id: verdict.market_id,
    amount_usdc: betSize,
    timestamp: now,
  };

  if (decision.skip) {
    const rec: BetRecord = {
      ...baseRecord,
      outcome_index: -1,
      tx_hash: null,
      status: "skipped",
      error: decision.reason,
    };
    db.insertBet(rec);
    console.error(`[judge] auto-bet skipped: ${decision.reason}`);
    return;
  }

  // We have a YES/NO direction + outcome name. Resolve the index for
  // multi-outcome markets by reading the live outcomes list.
  let outcomeIdx = decision.outcome_index;
  if (outcomeIdx < 0) {
    try {
      const { fetchMarket } = await import("@delphi-duel/sdk");
      const m = await fetchMarket(verdict.market_id);
      const i = m.outcomes.indexOf(decision.outcome_name);
      if (i < 0) {
        const reason = `outcome "${decision.outcome_name}" not found in market.outcomes (${m.outcomes.join(" / ")})`;
        db.insertBet({
          ...baseRecord,
          outcome_index: -1,
          tx_hash: null,
          status: "skipped",
          error: reason,
        });
        console.error(`[judge] auto-bet skipped: ${reason}`);
        return;
      }
      outcomeIdx = i;
    } catch (err) {
      const reason = `outcome lookup failed: ${(err as Error).message}`;
      db.insertBet({
        ...baseRecord,
        outcome_index: -1,
        tx_hash: null,
        status: "skipped",
        error: reason,
      });
      console.error(`[judge] auto-bet skipped: ${reason}`);
      return;
    }
  }

  if (!autoBetEnabled) {
    db.insertBet({
      ...baseRecord,
      outcome_index: outcomeIdx,
      tx_hash: null,
      status: "skipped",
      error: `AUTO_BET=false (would have bet ${decision.side} on outcome ${outcomeIdx} "${decision.outcome_name}" for $${betSize.toFixed(2)})`,
    });
    console.error(
      `[judge] auto-bet DRY RUN: would bet $${betSize.toFixed(2)} on outcome ${outcomeIdx} "${decision.outcome_name}" (${decision.side}). Set AUTO_BET=true to enable.`,
    );
    return;
  }

  // Live path — actually place the bet.
  console.error(
    `[judge] auto-bet LIVE: placing $${betSize.toFixed(2)} on outcome ${outcomeIdx} "${decision.outcome_name}" (${decision.side})…`,
  );
  try {
    const result = await placeBet(verdict.market_id, outcomeIdx, betSize);
    db.insertBet({
      ...baseRecord,
      outcome_index: outcomeIdx,
      tx_hash: result.tx_hash,
      status: "placed",
      error: null,
    });
    console.error(
      `[judge] auto-bet PLACED: tx=${result.tx_hash}  shares=${result.shares_out.toString()}  spent=$${result.spent_usdc.toFixed(4)}  buyer=${result.buyer_address}`,
    );
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    db.insertBet({
      ...baseRecord,
      outcome_index: outcomeIdx,
      tx_hash: null,
      status: "failed",
      error: msg,
    });
    console.error(`[judge] auto-bet FAILED (non-fatal): ${msg}`);
    // Crucially we do NOT rethrow — judge continues processing future duels.
  }
}

/* ---------- main loop ---------- */

export interface RunJudgeOptions {
  /** Path to data.db. Defaults to repo-root/data.db. */
  dbPath?: string;
  /** Long timeout — judge polls until killed. */
  recvTimeoutMs?: number;
}

export async function runJudge(opts: RunJudgeOptions = {}): Promise<void> {
  const peerKeys = loadPeerKeys();
  const ourPubkey = peerKeys.judge.pubkey;
  const bullPubkey = peerKeys.bull.pubkey;
  const dbPath = opts.dbPath ?? process.env.DELPHI_DUEL_DB ?? DEFAULT_DB_PATH;

  // Sanity: confirm our AXL node is up and reports the pubkey we expect.
  const topo = await getTopology(JUDGE_API_PORT);
  if (topo.our_public_key !== ourPubkey) {
    throw new Error(
      `Judge AXL node :${JUDGE_API_PORT} reports ${topo.our_public_key} ` +
        `but public-keys.json says ${ourPubkey}. Re-run pnpm axl:probe?`,
    );
  }
  console.error(`[judge] up — pubkey ${ourPubkey.slice(0, 16)}…`);

  const db: DuelDb = openDb(dbPath);
  console.error(`[judge] db: ${db.path}`);

  // Drain any stale messages from a prior run.
  const drained = await drainRecv(JUDGE_API_PORT);
  if (drained > 0) console.error(`[judge] drained ${drained} stale recv message(s)`);

  console.error(`[judge] polling /recv for duel transcripts...`);

  // Loop forever (the orchestrator will SIGTERM us when the duel ends
  // OR run-duel will keep us alive across multiple duels).
  // We use a *very* long timeout so the loop never trips on idle silence.
  const longTimeout = opts.recvTimeoutMs ?? 24 * 60 * 60_000;

  while (true) {
    const incoming = await recvWait(JUDGE_API_PORT, longTimeout);
    let envelope: DuelTranscript;
    try {
      envelope = DuelTranscriptSchema.parse(JSON.parse(incoming.body));
    } catch (err) {
      console.error(
        `[judge] WARN: ignoring malformed message (${(err as Error).message})`,
      );
      continue;
    }
    if (incoming.fromPeerId !== peerKeys.bull.axl_peer_id) {
      console.error(
        `[judge] WARN: transcript from unexpected peer ${incoming.fromPeerId.slice(0, 16)}…; processing anyway`,
      );
    }

    console.error(
      `[judge] received transcript for duel ${envelope.duel_id} (${envelope.turns.length} turns) — calling Claude...`,
    );

    let payload: VerdictPayload;
    try {
      payload = await judgeTranscript(envelope);
    } catch (err) {
      console.error(`[judge] FAIL: ${(err as Error).message}`);
      continue;
    }

    const record: VerdictRecord = {
      ...payload,
      duel_id: envelope.duel_id,
      market_id: envelope.market_id,
      produced_at: new Date().toISOString(),
    };
    db.insertVerdict(record);
    console.error(
      `[judge] verdict written: winner=${record.winner} confidence=${record.confidence.toFixed(2)} → "${record.recommended_position}"`,
    );

    // Send back to bull (coordinator). Best-effort — if bull is gone,
    // the verdict is still in SQLite.
    const verdictEnvelope: DuelVerdict = { type: "duel_verdict", verdict: record };
    try {
      await send(JUDGE_API_PORT, bullPubkey, JSON.stringify(verdictEnvelope));
      console.error(`[judge] verdict relayed → bull`);
    } catch (err) {
      console.error(
        `[judge] could not relay verdict back to bull (${(err as Error).message}) — non-fatal, persisted to db`,
      );
    }

    // Phase 12 — autonomous betting. Wrapped in its own try/catch so any
    // logic error here cannot crash the long-running judge daemon.
    try {
      await attemptAutoBet(record, envelope, db);
    } catch (err) {
      console.error(
        `[judge] auto-bet logic threw (non-fatal): ${(err as Error).message}`,
      );
    }
  }
}
