# Build Guide — Delphi Duel

**4 days. Solo. Claude Code Desktop. No cloud. No paid services beyond Anthropic API.**

Read this guide once. Then come back and start at Day 1, Step 1. Don't read ahead. Don't multitask.

If stuck for 15 minutes:

> "i'm stuck. explain in simple words what just went wrong, then break the next step into something smaller."

---

# DAY 1 — get AXL working between two nodes

This is the make-or-break day. If two nodes are talking by tonight, the rest is downhill. If not, you're in trouble. **Do not move past Day 1 without a passing test-mesh.**

## Step 1 — install tools (15 min)

Open Mac terminal **once**.

```
node -v
```

Need v20+. If not: install from nodejs.org.

```
go version
```

Need **1.25.5+**. If you have an older version or none:

```
brew install go
```

If brew gives you something older than 1.25.5, install directly from go.dev. **AXL pins Go 1.25.5 and won't build with older versions.**

```
openssl version
```

Should print something. Pre-installed on Mac.

```
npm install -g pnpm
```

Close terminal. We use Claude Code for everything from here.

## Step 2 — make project folder (3 min)

Finder → desktop → new folder → name it **delphi-duel**.

Drop `CLAUDE.md`, `PHASE_0_CHECKLIST.md`, and `BUILD_GUIDE.md` (this file) into the folder.

Leave finder open so you watch files appear as Claude builds.

## Step 3 — finish prep checklist (45 min)

Open `PHASE_0_CHECKLIST.md`. Work through every item.

Musts before moving on:

- Anthropic API key + spend cap
- Go 1.25.5+ confirmed
- openssl working
- 5 demo Delphi markets saved with IDs, URLs, prompts
- Bull and Bear system prompts pre-drafted

Don't skip. The hour you spend here saves four later.

## Step 4 — attach folder to Claude Code (2 min)

In Claude Code:

- Click folder icon at bottom (next to "local")
- Browse to desktop, pick **delphi-duel**
- Confirm it shows in bottom bar and is selected

## Step 5 — start a fresh session (1 min)

Click **+ new session** in sidebar.

Bottom right:

- Model: **Sonnet 4.6**
- Thinking: **medium**
- Accept edits: **on**

## Step 6 — let Claude read the plan (5 min)

Paste:

> read CLAUDE.md and PHASE_0_CHECKLIST.md in this folder. summarize back what we're building, the architecture, the stack, what AXL is, and what phase we're starting. confirm you understand: AXL is a Go binary, two nodes peer on localhost, communication is via /send and /recv on each node's local HTTP bridge. do not write any code yet.

If summary matches → "looks good, continue"

If wrong or vague → tell Claude what's wrong, ask for CLAUDE.md edits.

Don't move on until Claude understands.

## Step 7 — Phase 1, scaffold (1 hour)

Paste:

> let's start phase 1. scaffold the repo per CLAUDE.md. pnpm workspaces. create /agents/bull, /agents/bear, /agents/shared, /web, /shared/types, /shared/sdk, /axl, /scripts. typescript everywhere. install deps: @gensyn-ai/gensyn-delphi-sdk in /shared/sdk, zod, better-sqlite3, dotenv at the root. create .env.example with ANTHROPIC_API_KEY. create .gitignore including /axl/keys/, /axl/axl-repo/, .env files, node_modules, *.db, KILL, dist, .next, *.pem. initialize git. show me the file tree when done. don't write any feature code yet.

If Claude asks permission for something, say yes.

When done, check:

- File tree matches CLAUDE.md
- pnpm install ran clean

Then:

> good. commit phase 1 with message "phase 1: scaffold" and update phase status in CLAUDE.md.

## Step 8 — Phase 2, build AXL and generate keys (2 hours)

New session.

> read CLAUDE.md. starting phase 2: clone AXL, build the binary, generate two ed25519 identity keys, write two AXL node configs.

Then:

> step 2a: clone github.com/gensyn-ai/axl into /axl/axl-repo (this folder is gitignored). cd into it and run `make build`. this produces a `node` binary inside the cloned repo. write /axl/scripts/build.sh that does this idempotently. show me the binary path when built.
>
> step 2b: write /axl/scripts/generate-keys.sh that runs:
>   openssl genpkey -algorithm ed25519 -out /axl/keys/bull.pem
>   openssl genpkey -algorithm ed25519 -out /axl/keys/bear.pem
> creates the directory if missing. show me both keys exist after running.
>
> step 2c: write /axl/node-config-1.json (bull's AXL config). minimum fields:
>   - PrivateKeyPath: absolute path to /axl/keys/bull.pem
>   - Listen: ["tls://0.0.0.0:9001"]  (this node listens for incoming peers)
>   - Peers: []
>   - api_port: 9002
>   - max_message_size: 16777216
> reference the AXL repo's example node-config.json for the exact key names and any other required fields.
>
> step 2d: write /axl/node-config-2.json (bear's AXL config):
>   - PrivateKeyPath: absolute path to /axl/keys/bear.pem
>   - Listen: []  (this node connects out to bull's node)
>   - Peers: ["tls://127.0.0.1:9001"]
>   - api_port: 9012  (different port so the two nodes don't conflict)
>
> step 2e: write /axl/scripts/start-mesh.sh that starts both nodes in the background, redirects logs to /axl/logs/node-1.log and /axl/logs/node-2.log, and prints the PIDs so we can kill them. start them with: `/axl/axl-repo/node -config /axl/node-config-X.json &`
>
> walk me through running build.sh, generate-keys.sh, and start-mesh.sh step by step. confirm both nodes boot without errors. then run `curl http://127.0.0.1:9002/topology` and `curl http://127.0.0.1:9012/topology` and show me both responses. each should print our_public_key.

Go slow. Run scripts when Claude asks. Confirm output back to Claude.

What "alive" looks like:

- Both binaries running
- Both `/topology` calls return JSON with `our_public_key` (64-char hex)
- No crashes in either node's log

Important: **save both public keys to a notes file**. You'll use them in step 9.

When both nodes show topology:

> commit phase 2 and update phase status.

## Step 9 — Phase 3, prove the two nodes talk (2-3 hours)

THIS IS THE CRITICAL TEST. Don't move past this without it passing.

New session.

> read CLAUDE.md. starting phase 3: prove the two AXL nodes can exchange a message via /send and /recv.

> first, query both /topology endpoints and capture both public keys. write them to /axl/keys/public-keys.json so future scripts can read them. confirm: bull node listens on port 9001 + has api on 9002, bear node connects out to bull's listener + has api on 9012. give the network 5-10 seconds after start to fully peer (Yggdrasil takes a moment).
>
> then write /scripts/test-mesh.ts. it should:
> 1. read both public keys from the JSON file
> 2. POST to bull's send endpoint: http://127.0.0.1:9002/send with header X-Destination-Peer-Id: <bear's pubkey> and body "hello from bull"
> 3. expect 200 OK
> 4. poll bear's recv endpoint: http://127.0.0.1:9012/recv every 500ms for up to 10 seconds
> 5. when 200 returned, log the body and the X-From-Peer-Id header
> 6. confirm body matches "hello from bull" and X-From-Peer-Id matches bull's pubkey
> 7. exit 0 on success, exit 1 on failure
>
> add `pnpm test:mesh` to root package.json. walk me through running it. if it fails, read both AXL node logs from /axl/logs/ and diagnose what's wrong in simple words.

Run it. If it passes, you've cleared the hardest engineering hurdle in this project.

If it fails, common issues:

- Nodes haven't fully peered yet (wait longer between start and send)
- Wrong port in URLs (bull is 9002, bear is 9012)
- Public keys captured wrong (check /topology output structure)
- Listen address vs Peers mismatch (bull must Listen, bear must Peers)
- Yggdrasil's mesh hasn't propagated routes yet (sometimes takes 15-30s on first connection)

If stuck:

> "the test failed. paste both node log files. diagnose what's wrong in simple words. propose ONE small fix at a time."

Iterate until passing.

When test-mesh exits 0:

> THIS IS A MAJOR MILESTONE. commit phase 3 with message "phase 3: two AXL nodes communicate via /send and /recv". update CLAUDE.md.

End of day 1 checkpoint: **two AXL nodes running, exchanging a test message via /send + /recv.** If you got here, the hard part is done. Sleep well.

---

# DAY 2 — Delphi data + agents + protocol + working duel

## Step 10 — Phase 4, Delphi market fetcher (1-2 hours)

New session.

> read CLAUDE.md. starting phase 4: Delphi market fetcher (read only).

> in /shared/sdk, write a typed wrapper around @gensyn-ai/gensyn-delphi-sdk. expose fetchMarket(marketId) returning canonical Market type defined in /shared/types/market.ts. Market should have: id, prompt (full resolution text), outcomes (array of strings), implied_probabilities (array of numbers same length as outcomes), close_date (ISO string), category (string, optional). check the SDK docs at https://docs.gensyn.ai/tech/delphi-sdk.md?ask=how do I list markets and fetch a single market for usage details. add `pnpm fetch-market <id>` for testing. test on one of my saved demo market IDs and show me the result.

If the SDK has authentication or RPC needs, resolve here. May require:

- Setting an RPC URL via env
- Setting a CDP wallet config (we don't need one for read-only — confirm)

If anything blocks, paste the error to Claude:

> "the SDK is failing with this error: <paste>. read the SDK docs again and propose a fix."

Iterate. Commit when fetching markets cleanly.

## Step 11 — Phase 5, Bull and Bear agent processes (3 hours)

New session.

> read CLAUDE.md. starting phase 5: bull and bear agent processes.

> step 5a: write /agents/bull/system-prompt.md and /agents/bear/system-prompt.md based on what's in CLAUDE.md and what i'll paste. show me both before building anything.

Paste your pre-drafted Bull and Bear system prompts.

Review them. Push back if generic.

> step 5b: build /agents/shared/debate-engine.ts. exports a function `runTurn(systemPromptPath, market, lastPeerArgument | null, roundNumber)` that:
> 1. reads the system prompt from disk
> 2. constructs a user message with market info, peer's last argument (or "this is the opening round"), round number
> 3. calls Anthropic API with claude-sonnet-4-20250514, max_tokens 1024
> 4. parses response as strict JSON: { probability, confidence, reasoning, message_to_peer }
> 5. validates with zod, returns typed object
>
> step 5c: build /agents/bull/index.ts and /agents/bear/index.ts as standalone CLI processes for now. each takes a market id from argv, takes a peer-message JSON from stdin, calls runTurn, prints result to stdout. expose `pnpm dev:bull <market-id>` and `pnpm dev:bear <market-id>`.
>
> test by manually piping bull's output into bear's stdin and back, two rounds, on a real demo market. show me the transcript.

Validate that the agents actually debate (not just restate). If repetitive:

> "the agents are repeating themselves. iterate the system prompts to require them to specifically address what the peer just said, advance new arguments, and not repeat earlier points."

Commit when the manual pipe debate is interesting.

## Step 12 — Phase 6, AXL client + send/recv duel loop (3 hours)

New session.

> read CLAUDE.md. starting phase 6: AXL client wrapper, protocol schemas, and a working duel loop over /send + /recv.

> step 6a: write /agents/shared/axl-client.ts. wraps localhost AXL HTTP API. exposes:
>   - getTopology(apiPort): Promise<{ our_public_key: string, peers: ... }>
>   - send(apiPort, peerPubKey, payload): Promise<void>  // POST /send with header
>   - recv(apiPort, timeoutMs): Promise<{ from: string, body: Buffer } | null>  // poll /recv
>
> step 6b: write /agents/shared/protocol.ts. zod schemas for three message types:
>   - opening: { type: 'opening', round: 0, sender: pubkey, market_id, probability, confidence, reasoning, message_to_peer }
>   - argument: { type: 'argument', round: number, sender: pubkey, ...same fields }
>   - closing: { type: 'closing', round: number, sender: pubkey, ...same fields }
> all serialized as UTF-8 JSON before going through /send.
>
> step 6c: refactor /agents/bull/index.ts and /agents/bear/index.ts. each is now a long-running process that:
> 1. on start, reads its api_port from env (BULL=9002, BEAR=9012) and the peer's pubkey from /axl/keys/public-keys.json
> 2. broadcasts an opening via /send if it's the bull (bull always opens)
> 3. polls /recv every 500ms for inbound messages
> 4. on receiving a peer message, parse with zod, call debate-engine.runTurn, broadcast response back via /send
> 5. tracks round number locally, terminates after closing
> 6. logs every send and receive to console with timestamps
> 7. writes every turn to /data.db (sqlite) so the web UI can read it
>
> step 6d: test by running both AXL nodes (start-mesh.sh), then in two separate terminals run `pnpm dev:bear` first (so it's ready to receive), then `pnpm dev:bull <market-id>`. show me logs from both. confirm at least 3 rounds happen and the transcript is in the db.

Watch logs. You should see:

- Bull broadcasts opening
- Bear receives opening, runs Claude call, broadcasts argument back
- Bull receives argument, runs Claude call, broadcasts argument
- Repeat for N=5 rounds
- Closing statements
- All written to SQLite

When it works end to end, commit. **Day 2 is done.**

---

# DAY 3 — full duel polish + UI

## Step 13 — Phase 7, hardened CLI duel orchestrator (2 hours)

New session.

> read CLAUDE.md. starting phase 7: a clean CLI orchestrator for full duels.

> write /scripts/run-duel.ts. takes a market id. it:
> 1. starts both AXL nodes via start-mesh.sh if not already running
> 2. waits for /topology on both to confirm they're up
> 3. spawns bull and bear processes via Node.js child_process
> 4. waits for the duel to finish (closing statements written to db)
> 5. prints a clean summary: opening probabilities → final probabilities, who moved more, transcript path
> 6. cleans up all child processes on exit (SIGINT handler too)
>
> add `pnpm run-duel <market-id>`. test on 3 different market ids. show me the summaries.

Read transcripts. If quality drops on certain markets:

> "the agents struggle on this market because <reason>. iterate system prompts to handle this case better."

Commit when 3 different markets all produce coherent debates.

## Step 14 — Phase 8, web UI (4 hours)

New session.

> read CLAUDE.md. starting phase 8: web UI.

> next.js 14 app router at /web. tailwind, shadcn/ui, framer-motion. one main page (/). features:
>
> top: market picker (dropdown of pre-loaded demo markets from CLAUDE.md, plus a "paste market URL" input). a "Mesh Status" indicator showing both AXL nodes are reachable (poll /topology every 5s).
>
> middle: two agent avatars side by side. green for bull, red for bear. each has:
>   - a probability bar (animated to new value with framer-motion, ~500ms)
>   - current round indicator
>   - "thinking..." spinner when waiting for their turn
>
> below: live transcript pane. each turn is a card with sender, round, probability, reasoning, message_to_peer. autoscroll to newest.
>
> bottom: "Start Duel" button. an "AXL message log" small panel showing raw send/recv events with timestamps and sizes (this proves AXL is doing the work, judges love seeing it).
>
> backend: /api/start-duel POST takes market id, spawns run-duel.ts as a child process, returns immediately with duel_id. /api/transcript?duel_id=X polls SQLite and returns latest turns since timestamp. UI polls every 1s for updates.
>
> style: minimal, dark, futuristic. think trading terminal but cleaner. preload my 5 demo markets from CLAUDE.md memory. when ready run pnpm dev:web and tell me where to open in browser.

Open localhost:3000. Screenshot. Paste back with notes:

> "avatars too small — make them prominent, this is the visual centerpiece"
> "transcript needs autoscroll to newest message"
> "probability bars should snap with 500ms animation, not jump"
> "AXL log in the corner is too dim — make it readable, that panel is what proves we're using AXL"

Iterate until intentional. Commit.

End of day 3 checkpoint: **a working web demo where you pick a market, hit start, and watch two agents debate live across two AXL nodes.**

---

# DAY 4 — polish, README, rehearse, submit

## Step 15 — (Stretch) Phase 9, upgrade to /a2a/ (skip if behind, 2-3 hours)

Skip this step if Day 3 is not yet complete. /send + /recv is sufficient for qualification.

If on schedule:

> read CLAUDE.md. phase 9 (stretch): upgrade debate turns from /send + /recv to /a2a/{peer_id}/.

> the AXL repo ships an A2A server integration in /integrations. study it briefly (https://github.com/gensyn-ai/axl/tree/main/integrations). for our purposes, we need each agent's AXL node to forward incoming /a2a/ requests to a local A2A handler.
>
> simplest path: for each node, set a2a_addr in node-config.json to point at a local Node.js server we expose. the Node.js A2A handler is a tiny express server that accepts JSON-RPC requests and runs runTurn() with them. opening and closing stay on /send. only the back-and-forth argument turns use /a2a/.
>
> if A2A integration takes more than 2 hours, abort and stay on /send. note in README that we use /send + /recv as the qualification path with /a2a as a future enhancement.

If you ship A2A, the pitch becomes stronger ("uses both AXL primitives — broadcast and structured request/response"). If you don't ship it, you still qualify cleanly.

## Step 16 — Phase 10, polish and submit (4-5 hours)

New session.

> read CLAUDE.md. starting phase 10: polish and submit.
>
> 1. fix any bugs we've been ignoring. list them all, triage by severity, fix critical and high. skip low if running short.
>
> 2. write the README. sections: 1-line pitch, problem (what does Delphi Duel solve), solution (how it works), mermaid architecture diagram showing two AXL nodes peering on localhost + bull/bear agents + UI, how to run locally with exact commands (pnpm install, pnpm axl:build, pnpm axl:keys, pnpm axl:start, pnpm dev:web), demo gif (placeholder for now), qualification statement: explicitly say which AXL endpoints we use (/send, /recv, /topology, optionally /a2a/), confirm cross-node communication, license MIT.
>
> 3. record a 30-60 second screen recording of a full duel running on a demo market. convert to gif. embed in README.
>
> 4. write a checklist of every demo path that must work flawlessly during the live pitch. walk me through testing each one right now.

Run through every demo path. Fix anything broken.

## Step 17 — final rehearsal (1 hour)

> stop building. let's rehearse the demo and pitch.

Speak the pitch out loud while the demo runs. Time yourself. Aim for 90 seconds.

Record a backup screen recording of the full demo working — your insurance if the live demo crashes.

If the pitch feels stiff:

> "rewrite the pitch in my voice — short sentences, lowercase except start of sentences, no buzzwords, no bolds, grounded and direct."

## Step 18 — submit (15 min)

ETHGlobal submission portal:

- Project name: **Delphi Duel**
- Tagline: **The second opinion engine for Delphi prediction markets**
- Description: lift from README intro
- GitHub link: your repo
- Demo video: backup screen recording
- Track: **Gensyn — Best Application of Agent eXchange Layer (AXL)**

Submit. Breathe.

---

# Tips for Claude Code Desktop

- **One session per phase** keeps context clean
- **Sonnet 4.6 medium** for everything. The build is small enough you don't need Opus
- **Pin sessions** for Phase 3 (mesh test) and Phase 6 (axl-client + protocol). You'll come back if bugs appear
- **Keep finder open** to /axl folder so you watch keys appear, configs change
- **Multi-pane terminal** alongside Claude Code so you can watch both AXL node logs side by side. Mac Terminal does split panes (View → Show Tab Bar, then ⌘D)
- **Save common openers as routines**: "read CLAUDE.md, we're starting phase X" can be a saved routine
- **Kill switch**: if anything runs away, create empty `KILL` file in project root via finder. Halts agents

---

# When Claude is being weird

- "explain in simple words what just went wrong"
- "show me the exact file and line that broke"
- "roll back that change and try a smaller version"
- "i don't understand. break this into 3 smaller steps and do only the first"

Stuck more than 30 minutes on one thing? **Simplify the feature.** Ship the smaller version.

---

# What "winning" looks like

- 1st ($2.5k): clean code, AXL-deep, 90-second demo lands, README is exceptional, project name memorable
- 2nd-3rd ($1.5k or $1k): everything works, demo runs, README solid, but a bigger team out-polishes you
- Top 10 (still grant track): everything works, demo fine, README exists. Even this is real — Gensyn Foundation grants matter

Aim for 1st. Settle for nothing less than top 3. You can hit it.

Now go. Don't read ahead. Start at Day 1, Step 1.

Ship it.
