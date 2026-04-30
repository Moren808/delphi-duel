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
import { openDb, DEFAULT_DB_PATH, type DuelDb } from "./storage.js";

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
  }
}
