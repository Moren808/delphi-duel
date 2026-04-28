/**
 * Phase 5/6 — Claude API call + JSON parse, generic across both agents.
 *
 * `runTurn()` takes the agent's role, system prompt, market, round number,
 * peer's last `message_to_peer`, and returns a validated TurnRecord.
 * One retry on JSON parse failure with a stronger reminder.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { Market } from "@delphi-duel/shared-types";
import {
  TurnPayloadSchema,
  type TurnPayload,
  type TurnRecord,
  type AgentRole,
  peerRole,
} from "./protocol.js";

// AGENTS.md spec: Anthropic API, model claude-sonnet-4-20250514. Strict JSON outputs.
const MODEL = process.env.DELPHI_DUEL_MODEL ?? "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.6;

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Read a system prompt from disk relative to this file. */
export function loadSystemPrompt(role: AgentRole): string {
  const path = resolve(__dirname, "..", role, "system-prompt.md");
  return readFileSync(path, "utf8");
}

/* ---------- prompt construction ---------- */

interface BuildUserPromptArgs {
  role: AgentRole;
  market: Market;
  champion_outcome_idx: number;
  round: number;
  peerLastMessage: string | null;
  selfLastMessage: string | null;
}

function buildUserPrompt(args: BuildUserPromptArgs): string {
  const { role, market, champion_outcome_idx, round, peerLastMessage, selfLastMessage } = args;

  const champion = market.outcomes[champion_outcome_idx] ?? "(unknown outcome)";
  const isBinary = market.outcomes.length === 2;
  const championProb = market.implied_probabilities[champion_outcome_idx] ?? 1 / market.outcomes.length;

  const outcomesLine = isBinary
    ? market.outcomes.join(" / ")
    : market.outcomes
        .map((o, i) =>
          i === champion_outcome_idx ? `${o} (champion)` : o,
        )
        .join(" / ");

  const lines: string[] = [];
  lines.push("MARKET");
  lines.push(market.prompt);
  lines.push("");
  lines.push(`Outcomes: ${outcomesLine}`);
  if (!isBinary) {
    lines.push(
      `Champion outcome (treat as YES): "${champion}". All other outcomes count as NO.`,
    );
  }
  lines.push(
    `Market-implied P(${isBinary ? "YES" : "champion"}): ${championProb.toFixed(3)}`,
  );
  // Anchor the agent in time: today's date + days to resolution. Prevents
  // the model from guessing the time-to-close from training-time priors
  // (which produced "5+ months" / "16-month window" mistakes in Phase 5
  // testing on a market that resolved in ~33 days).
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  if (market.close_date) {
    const resolves = new Date(market.close_date);
    const daysToResolve = Math.round(
      (resolves.getTime() - today.getTime()) / 86_400_000,
    );
    lines.push(`Today: ${todayIso}  (resolves in ${daysToResolve} days)`);
    lines.push(`Resolves: ${market.close_date}`);
  } else {
    lines.push(`Today: ${todayIso}`);
  }
  if (market.category) {
    lines.push(`Category: ${market.category}`);
  }
  lines.push("");
  lines.push(`ROUND ${round}`);
  lines.push("");

  const peerName = peerRole(role) === "bull" ? "Bull" : "Bear";

  if (round === 0 || peerLastMessage == null) {
    lines.push(`PEER'S LAST TURN (from ${peerName}):`);
    lines.push("(this is the opening round; no peer message yet — open with your initial reading)");
  } else {
    lines.push(`PEER'S LAST TURN (from ${peerName}):`);
    lines.push(peerLastMessage);
  }

  if (selfLastMessage) {
    lines.push("");
    lines.push("YOUR LAST MESSAGE TO PEER (for continuity, do not repeat):");
    lines.push(selfLastMessage);
  }

  lines.push("");
  lines.push(
    "Return ONLY the JSON object specified in your system prompt. No markdown fences, no preamble.",
  );

  return lines.join("\n");
}

/* ---------- Claude call + parse ---------- */

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

/** Strip leading/trailing markdown fences and extract the first JSON object. */
function extractJsonObject(text: string): string {
  let s = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if the model added them.
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }
  // If there's preamble, slice from the first { to the matching last }.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    s = s.slice(first, last + 1);
  }
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
  // Concatenate any text blocks (Sonnet rarely returns multiple, but defensive).
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new Error(`Claude returned no text content (stop_reason=${res.stop_reason})`);
  }
  return text;
}

/** Try to parse text as TurnPayload; return null on failure. */
function tryParse(text: string): TurnPayload | null {
  const candidate = extractJsonObject(text);
  try {
    const parsed = JSON.parse(candidate);
    const result = TurnPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/* ---------- public API ---------- */

export interface RunTurnArgs {
  duel_id: string;
  role: AgentRole;
  market: Market;
  /** 0-indexed outcome being defended. 0 for binary Yes/No markets. */
  champion_outcome_idx?: number;
  round: number;
  /** Peer's last `message_to_peer`. Null on round 0. */
  peerLastMessage: string | null;
  /** This agent's previous `message_to_peer`, if any. Helps avoid repetition. */
  selfLastMessage?: string | null;
  /** Whether this turn is the producer's last. Bookkeeping; the LLM never sees it. */
  is_final: boolean;
}

export async function runTurn(args: RunTurnArgs): Promise<TurnRecord> {
  const champion_outcome_idx = args.champion_outcome_idx ?? 0;
  const systemPrompt = loadSystemPrompt(args.role);
  const userPrompt = buildUserPrompt({
    role: args.role,
    market: args.market,
    champion_outcome_idx,
    round: args.round,
    peerLastMessage: args.peerLastMessage,
    selfLastMessage: args.selfLastMessage ?? null,
  });

  // First attempt.
  const text1 = await callClaude(systemPrompt, userPrompt);
  let payload = tryParse(text1);

  // One retry with an extra-strict reminder if the first parse fails.
  if (!payload) {
    const reminder =
      userPrompt +
      '\n\n[reminder] Your previous response could not be parsed as the required JSON. Output ONLY {"probability":N,"confidence":N,"reasoning":"...","message_to_peer":"..."} with valid JSON syntax. Nothing else.';
    const text2 = await callClaude(systemPrompt, reminder);
    payload = tryParse(text2);
    if (!payload) {
      throw new Error(
        `Failed to parse Claude output as TurnPayload after 2 attempts. Last raw text:\n${text2}`,
      );
    }
  }

  return {
    ...payload,
    duel_id: args.duel_id,
    round: args.round,
    role: args.role,
    market_id: args.market.id,
    champion_outcome_idx,
    is_final: args.is_final,
    produced_at: new Date().toISOString(),
  };
}
