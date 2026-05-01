# Contributing to Delphi Duel

Thanks for the interest. This document covers the three things we get asked about most:

1. [Adding a new specialist agent](#1-adding-a-new-specialist-agent) (e.g. a quant agent, a calendar agent, a fact-check agent)
2. [Running tests](#2-running-tests)
3. [Contributing to the judge system prompt](#3-contributing-to-the-judge-system-prompt)

For the architecture overview, see [`README.md`](README.md). For the day-to-day "what's where" cheatsheet, see [`AGENTS.md`](AGENTS.md). For demo logistics, see [`DEMO.md`](DEMO.md).

---

## 1 · Adding a new specialist agent

The current shape is bull / bear (debaters) + judge (arbiter). Adding a fourth role — e.g. a **quant** that injects historical base rates, or a **calendar** agent that surfaces deadline-sensitive context — follows the same pattern as the judge.

### Step-by-step

#### 1a · AXL identity + node
Generate a fourth ed25519 keypair and a fourth node config:

```bash
# In axl/scripts/generate-keys.sh, add:
generate_if_missing "myagent" "$KEYS_DIR/myagent.pem"
# And the corresponding cat > $AXL_DIR/node-config-4.json with api_port 9032
```

Pick an unused `api_port` outside the 9002 / 9012 / 9022 range — convention is `9032`, `9042`, etc. Update `axl/scripts/start-mesh.sh` to spawn the fourth node and `axl/scripts/probe-keys.sh` to capture its pubkey + axl_peer_id into `axl/keys/public-keys.json`.

#### 1b · The agent runtime

Mirror `agents/judge/` exactly:

```
agents/myagent/
├── index.ts            # bootstrap — load .env.local, call runMyAgent()
├── package.json        # workspace package, depends on @delphi-duel/agents-shared
├── system-prompt.md    # Claude system prompt
└── tsconfig.json       # extends ../../tsconfig.base.json
```

Then add a runner in `agents/shared/`:

```ts
// agents/shared/myagent-runner.ts
export async function runMyAgent(opts: RunMyAgentOptions): Promise<void> {
  // 1. Load peer keys from axl/keys/public-keys.json
  // 2. Open SQLite db
  // 3. Drain stale /recv
  // 4. Loop: poll /recv → parse incoming envelope → call Claude → persist → optionally /send back
}
```

The judge runner (`agents/shared/judge-runner.ts`) is a clean reference. Copy its structure, change:
- The API port (`JUDGE_API_PORT` → your port)
- The expected envelope schema (define a new `*Schema` in `protocol.ts`)
- The Claude temperature (judge uses 0.3 for steadiness; pick what suits)
- The output schema and SQLite table

#### 1c · The protocol

In `agents/shared/protocol.ts`, add zod schemas for:
- The envelope your agent receives (e.g. `MarketContextRequestSchema`)
- The envelope your agent emits (e.g. `MarketContextResponseSchema`)

Discriminate by a `type` field literal — `"my_agent_response"` etc. — so the receiver can multiplex if it ends up listening on a single port for multiple message types. Add a new `*Record` schema if the result needs persisting.

#### 1d · Storage

In `agents/shared/storage.ts`, add:
- A `CREATE TABLE IF NOT EXISTS my_agent_outputs (...)` to the `SCHEMA` constant
- An `insertMyAgentOutput()` method on `DuelDb`
- A `getMyAgentOutput(duelId)` reader

Use `INSERT OR REPLACE` keyed on `duel_id` if the output is one-per-duel (like verdicts), or on `(duel_id, round)` if one-per-turn (like the agents' turns table).

#### 1e · The orchestrator

In `agents/shared/agent-runner.ts`, decide where in the duel lifecycle your agent fires. The judge fires once after both finals; a quant might fire once before any duel turn (to inject base rates into the user prompt). Add the `/send` of your envelope at the appropriate hook in `runAgent`.

If your agent needs to be running before bull / bear, extend `axl/scripts/start-mesh.sh` to start it as part of the boot sequence and document it in `DEMO.md`.

#### 1f · Wire up the workspace

```yaml
# pnpm-workspace.yaml
packages:
  - "agents/myagent"   # add this
  ...
```

```jsonc
// package.json
"scripts": {
  "dev:myagent": "pnpm --filter @delphi-duel/myagent dev",
  ...
}
```

Then `pnpm install` to register the workspace package.

#### 1g · Surface in the web UI (optional)

If your agent's output should show in the dashboard, add a card component (mirror `web/components/verdict-card.tsx`) and a server route (mirror `web/app/api/verdict/route.ts`). The page polls `/api/<your-thing>?duel_id=<id>` and renders when data lands.

#### Hard rules
- **No agent imports another agent's directory.** All inter-agent communication goes through AXL `/send` + `/recv`. If you find yourself reaching for `import { ... } from "@delphi-duel/judge"` from inside `agents/myagent/`, stop — define the contract in `agents/shared/protocol.ts` instead.
- **Strict-JSON LLM output.** Validate with zod. One retry on parse failure with a sharper "JSON ONLY" reminder. Throw if the second attempt also fails.
- **SQLite reads must be safe even when the table doesn't exist.** Pre-Phase-9 databases didn't have a `verdicts` table; the API route falls back to `null` cleanly. Mirror that pattern.

---

## 2 · Running tests

There's no formal test framework yet — the project leans on **runnable verification scripts** + manual end-to-end runs. To verify your changes haven't broken anything:

### 2a · Type-check everything

```bash
pnpm exec tsc --noEmit -p shared/sdk
pnpm exec tsc --noEmit -p shared/types
pnpm exec tsc --noEmit -p agents/shared
pnpm exec tsc --noEmit -p agents/bull
pnpm exec tsc --noEmit -p agents/bear
pnpm exec tsc --noEmit -p agents/judge
pnpm exec tsc --noEmit -p web
```

All seven should exit 0. If you've added a new package, add it here.

### 2b · AXL ping test

```bash
pnpm axl:start
sleep 5
pnpm axl:probe
pnpm test:mesh                 # bull → bear ping over /send + /recv
```

Should print `PASS — bull → bear ping over AXL /send + /recv works.` This is the cheapest sanity check that the mesh transport itself works.

### 2c · Live duel end-to-end

```bash
# Run a duel on the binary crypto-exploit market:
pnpm run-duel 0xc81b47c859a8b8290c3931d46562b547d283d3f4

# Verify SQLite has 4 turns + 1 verdict:
sqlite3 data.db "SELECT COUNT(*) FROM turns WHERE duel_id IN (SELECT duel_id FROM verdicts ORDER BY produced_at DESC LIMIT 1)"
# → 4
sqlite3 data.db "SELECT winner, ROUND(confidence,2) FROM verdicts ORDER BY produced_at DESC LIMIT 1"
# → bull|0.65 (or similar — Sonnet's temp 0.6 means non-deterministic)
```

Cost: ~75 seconds wall-clock + Anthropic Sonnet tokens for ~5 LLM calls (4 agents + 1 judge).

### 2d · Multi-outcome head-to-head

```bash
DELPHI_BULL_OUTCOME="Oklahoma City Thunder" \
DELPHI_BEAR_OUTCOME="Los Angeles Lakers" \
pnpm run-duel 0x3e43eee0ccb9ce348eb5d4d0eba29ef4a4e4572d
```

Confirm the orchestrator log says `mode: outcome head-to-head — Oklahoma City Thunder vs Los Angeles Lakers`. The probabilities should NOT sum to 1 in this mode — both can move down together as other outcomes absorb mass.

### 2e · Web build

```bash
pnpm --filter @delphi-duel/web build
```

Should compile clean. Runs `next build` which catches static-analysis issues the dev server tolerates.

### 2f · End-to-end through the UI

```bash
# Mesh + judge daemon must be running.
pnpm dev:judge &
pnpm dev:web
# Open http://localhost:3000
# Click "view example duel" — should render the bundled fixture without
# hitting any external API.
# Click a market + start duel — should run the full pipeline live.
```

If the dashboard renders unstyled HTML, nuke `web/.next` and restart — that's almost always a stale Next.js webpack cache, not a code regression.

---

## 3 · Contributing to the judge system prompt

The judge prompt (`agents/judge/system-prompt.md`) is **the single most important file in the repo** for product quality. Bull and bear's prompts shape what gets *said*; the judge's prompt shapes what the trader *takes away*. Treat it accordingly.

### 3a · Principles before words

If you want to change the judge's behavior, write down the principle first. Some examples that have driven recent edits:

- *"The judge should not just average the two probabilities — that throws away the information the debate generated."*
- *"The judge should weight engagement (does each side respond to the other?) higher than vibes."*
- *"The judge should not reach for 'inconclusive' as an easy out — it should only fire when both sides made roughly equally strong cases AND ended near each other."*

Land the principle as a sentence or two in the prompt's "What good looks like" or "Anti-patterns to avoid" sections. Avoid hedge-y rewrites of the schema description.

### 3b · Test against past duels

We have ~7 real duels in `data.db` with known good verdicts (see `README.md` "Live demo results"). Before merging a prompt change:

```bash
# Re-feed each completed transcript through the new judge prompt:
for duel in $(sqlite3 data.db "SELECT DISTINCT duel_id FROM turns WHERE duel_id IN (SELECT duel_id FROM verdicts)"); do
  # Manually craft a DuelTranscript envelope for $duel and POST to bull's /send
  # targeted at the judge's pubkey. (TODO: package this as a script.)
  echo "→ re-running judge on $duel"
done

# Compare new verdicts against the originals:
sqlite3 data.db "SELECT duel_id, winner, ROUND(confidence,2) FROM verdicts ORDER BY produced_at DESC"
```

If your prompt change flips a verdict on a duel where the original judgment was clearly correct, **debug before merging**. Either the prompt regressed something or the original duel was a borderline case that warrants the flip — figure out which.

### 3c · Don't break the wire format

The schema in the prompt is consumed by zod (`VerdictPayloadSchema` in `agents/shared/protocol.ts`):

```ts
{
  winner: "bull" | "bear" | "inconclusive",
  confidence: number in [0, 1],
  reasoning: string,
  suggested_lean: "lean YES" | "lean NO" | "too close to call",
  recommended_position: "strong YES" | "moderate YES" | "neutral" | "moderate NO" | "strong NO",
}
```

Renaming any field, adding a literal value (e.g. introducing `"strong neutral"`), or relaxing/tightening the constraint shape requires a coordinated change in `protocol.ts`. The verdict will fail to parse otherwise and the judge daemon will retry once then bail.

### 3d · Length budget

Reasoning paragraph: **2–3 sentences**. Hard rule. The trader is reading this on a small card during the live demo and on the post-duel review.

If you're tempted to expand to four sentences because "there's so much to say," that's exactly when you most need to compress — the judge that says less but cites the *specific* shift in the debate is more useful than the judge that recaps the whole conversation.

### 3e · The "no fabrication" rule applies to the judge too

Bull and bear are told not to invent specific facts. The judge can be tempted to do the same — citing exploits or events that came up in the debate even if those events themselves were probably hallucinated by an agent. The judge's job is to weight *the structure of the debate* (engagement, evidence quality, honest updating), not to certify the truth of any specific claim made within it.

### 3f · How to propose a change

1. Open a PR with the prompt diff
2. In the PR description, include:
   - The principle motivating the change (one paragraph)
   - At least one duel from `data.db` where you ran the new prompt and verified it produces a sensible verdict
   - If applicable: the verdict change(s), and why those flips are correct
3. Tag a maintainer for review

---

## License

MIT — see [`LICENSE`](LICENSE). By contributing you agree your contributions are licensed the same.
