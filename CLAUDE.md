# CLAUDE.md

Project memory for **Delphi Duel**. Read at the start of every session.

## What we're building

**Delphi Duel — the second opinion engine for Delphi prediction markets.**

A user pastes any Delphi market. Two AI agents — one bull (argues YES), one bear (argues NO) — debate it peer-to-peer over Gensyn's AXL mesh using the A2A (Agent-to-Agent) protocol. The user reads the transcript before placing their bet. Like having two analysts on retainer who'll argue the trade for you before you commit.

Two AXL nodes, both on the user's laptop. Different processes, different identity keys, different ports. They communicate only over AXL.

The pitch: *Before you bet on Delphi, get a second opinion. Two AI agents debate every market peer-to-peer over AXL. Read both sides before you risk anything.*

## Why this fits the hackathon

ETHGlobal Open Agents → Gensyn AXL prize ($5k pool, $2.5k for 1st).

Judging criteria:

- **Depth of AXL integration** — uses both `/send` for raw broadcasts AND `/a2a/{peer_id}` for structured request/response debate turns. AXL is the substrate, not a feature
- **Code quality** — small surface area means clean code. ~600 lines total, fully readable
- **Clear documentation** — short project = complete README is achievable
- **Working examples** — the live demo on a real Delphi market IS the example

Hard requirements:

- Uses AXL for inter-agent communication ✓
- Cross-node communication, not in-process ✓ (two separate processes, two AXL nodes, two identity keys)
- Built during the hackathon ✓

## Key facts about AXL (from gensyn-ai/axl AGENTS.md)

- AXL is a single Go binary. Runs on each machine
- Local HTTP API on `127.0.0.1:9002` by default (configurable via `api_port` in `node-config.json`)
- Three core endpoints:
  - `POST /send` — fire-and-forget raw bytes to a peer. Header: `X-Destination-Peer-Id` (64-char hex ed25519 public key). Body: any bytes
  - `GET /recv` — poll inbound messages. 204 = empty queue, 200 = body + `X-From-Peer-Id` header. **Note: messages routed to MCP or A2A handlers do NOT appear here**
  - `GET /topology` — returns `{our_ipv6, our_public_key, peers, tree}`. Use `our_public_key` to identify this node
- Two protocol-specific endpoints (request/response, 30s timeout):
  - `POST /a2a/{peer_id}` — JSON-RPC to peer's A2A server. **This is what we use for debate turns**
  - `POST /mcp/{peer_id}/{service}` — JSON-RPC to peer's MCP service (we don't use this)
- Identity is an ed25519 keypair. Generate with `openssl genpkey -algorithm ed25519 -out private.pem`. Set path in node-config.json's `PrivateKeyPath`. Public key is shown in `/topology`
- Peering: either both nodes have a shared public bootstrap peer in `Peers`, OR one node listens (`Listen: ["tls://0.0.0.0:9001"]`) and the other peers to it (`Peers: ["tls://127.0.0.1:9001"]`). For two local nodes, we use the second pattern
- Wire format: TCP messages are length-prefixed (4-byte big-endian uint32 + payload). Max 16 MB by default
- Both nodes must be running. No store-and-forward. If peer is offline, `/send` fails with dial error

## Architecture

```
                     AXL mesh (Yggdrasil)
              ┌───────────────┴────────────────┐
              │                                │
     ┌────────▼──────────┐             ┌───────▼───────────┐
     │ AXL node 1        │             │ AXL node 2        │
     │ api_port: 9002    │ ◄── mesh ──►│ api_port: 9012    │
     │ Listen 9001       │             │ Peers→9001        │
     │ private.pem (1)   │             │ private.pem (2)   │
     └────────▲──────────┘             └───────▲───────────┘
              │ HTTP                           │ HTTP
     ┌────────▼──────────┐             ┌───────▼───────────┐
     │  Bull Agent       │             │  Bear Agent       │
     │  (Node.js process)│             │  (Node.js process)│
     │  reads localhost  │             │  reads localhost  │
     │  :9002            │             │  :9012            │
     └───────────────────┘             └───────────────────┘
                              │
                              │
                     ┌────────▼─────────┐
                     │   Web UI         │
                     │   (Next.js)      │
                     │   reads SQLite   │
                     └──────────────────┘
```

Both nodes on the laptop. Node 1's AXL listens on `tls://127.0.0.1:9001`. Node 2's AXL has `Peers: ["tls://127.0.0.1:9001"]`. App ports differ (9002 and 9012) so the bull and bear agent processes can each talk to their own AXL HTTP bridge.

## Communication strategy

We use BOTH AXL endpoints to maximize integration depth:

1. **`POST /a2a/{peer_id}` for debate turns** — each round, one agent calls the other's A2A endpoint with a JSON-RPC payload containing the round number, current probability, reasoning, and message-to-peer. The receiver's A2A server processes it and returns a JSON-RPC response with their counter-argument. Synchronous, request/response. Perfect for turn-based debate.
2. **`POST /send` + `GET /recv` for status broadcasts** — opening statements, closing statements, and any "FYI" messages go via raw send/recv. Fire-and-forget.

This split is deliberate: judges see we understand AXL's protocol surface, not just one endpoint.

## A2A server setup

AXL's A2A server is a Python integration that the AXL node delegates to. Set `a2a_addr` in node-config.json to the local A2A server URL. The A2A server registers "skills" — Python services that handle JSON-RPC requests.

For our project, each agent's process needs to:

1. Run an A2A-compatible server locally (we'll implement a minimal one in Node.js, or use the Python integration shipped with AXL)
2. Tell its AXL node to forward A2A traffic to it (via `a2a_addr` config)
3. Make outbound A2A calls to the peer via `POST /a2a/{peer_id}`

If implementing the A2A server is too much work in 4 days, **we fall back to /send + /recv only**. The qualification still holds — we use AXL for cross-node communication. Plan for /send + /recv as the safe path; A2A is the stretch.

## The duel loop

1. User picks a Delphi market via the UI
2. Web app writes "duel started" to SQLite, fires off bull and bear processes (or signals them via filesystem/sockets — they're already running)
3. Bull broadcasts `opening` via `/send` to bear (round 0)
4. Bear receives via `/recv`, runs Claude API call to form its opening, broadcasts back
5. For N rounds (default 5):
   - Bull calls `/a2a/{bear_peer_id}` with its argument, gets bear's response back as the JSON-RPC reply
   - Each turn writes to SQLite
6. Final `closing` statements via `/send`
7. UI polls SQLite, shows transcript and probability bars updating live

## Stack

- **AXL**: Go binary built from `github.com/gensyn-ai/axl`. Two instances on the laptop. **Requires Go 1.25.5+**
- **Agents**: Node.js + TypeScript. Two processes, each reading its own AXL HTTP bridge
- **Delphi SDK**: `@gensyn-ai/gensyn-delphi-sdk` (TypeScript-only). For READ ONLY market fetching. No trading
- **AI**: Anthropic API, model `claude-sonnet-4-20250514`. Strict JSON outputs
- **Frontend**: Next.js 14, Tailwind, shadcn/ui, Framer Motion (probability bar animations)
- **DB**: SQLite via `better-sqlite3` for transcripts. One file shared
- **Process**: pnpm workspaces
- **Identity**: ed25519 keypairs via `openssl genpkey`, one per node, stored in `/axl/keys/`

No cloud. No Twitter. No Telegram. No wallets. No trading. Just the laptop.

## Repo structure

```
/agents
  /bull
    /index.ts                main loop: poll /recv, react, call peer's /a2a/
    /system-prompt.md
    /a2a-server.ts           local A2A server bull's AXL node forwards to (stretch)
  /bear
    /index.ts
    /system-prompt.md
    /a2a-server.ts
  /shared
    /axl-client.ts           HTTP wrapper around localhost AXL (send, recv, topology, a2a)
    /protocol.ts             zod schemas for opening/argument/closing message types
    /debate-engine.ts        Claude API call + JSON parse, generic across agents

/web
  /app
    /page.tsx                main duel UI
    /api
      /start-duel/route.ts   triggers a duel
      /transcript/route.ts   serves live transcript
  /components
    /probability-bar.tsx
    /transcript-pane.tsx
    /agent-avatar.tsx

/shared
  /types                     Market, Argument, Duel canonical types
  /sdk                       thin wrapper around @gensyn-ai/gensyn-delphi-sdk

/axl
  /node-config-1.json        bull's AXL config — Listen on tls://127.0.0.1:9001
  /node-config-2.json        bear's AXL config — Peers to bull
  /keys
    /bull.pem                ed25519 private key (gitignored)
    /bear.pem                ed25519 private key (gitignored)
  /scripts
    /build.sh                git clone + make build
    /generate-keys.sh        openssl genpkey x2
    /start-mesh.sh           start both AXL nodes in background

/scripts
  /test-mesh.ts              ping test: bull /send → bear /recv
  /run-duel.ts               CLI orchestrator for testing without UI

CLAUDE.md
README.md
PHASE_0_CHECKLIST.md
BUILD_GUIDE.md
```

## Conventions

1. **AXL is the only inter-agent channel.** Bull never imports anything from Bear's directory. They communicate only via AXL HTTP
2. **Strict JSON.** Every Claude call returns JSON only. Validated with zod on receipt
3. **Typed messages.** Every AXL payload defined in `/agents/shared/protocol.ts`
4. **Idempotent rounds.** Each round has a numeric index. Replays write the same row, not duplicates
5. **Non-fatal AXL.** If a peer is unreachable, log warning, retry with backoff
6. **No secrets in git.** `.env.local` per agent. `.pem` files in `/axl/keys/` (gitignored)

## Files Claude must read before changing

- `/agents/shared/protocol.ts` — A2A/send message contract
- `/agents/shared/axl-client.ts` — the HTTP wrapper. All AXL calls go through this
- `/axl/node-config-1.json` and `/node-config-2.json` — AXL setup
- `/agents/bull/system-prompt.md` and `/agents/bear/system-prompt.md`

## Phase status (update as you ship)

- [ ] Phase 1 — Scaffold + dependencies
- [ ] Phase 2 — Clone AXL, build binary, generate two ed25519 keys, write two configs
- [ ] Phase 3 — Two nodes peer locally (test-mesh ping passes via /send + /recv)
- [ ] Phase 4 — Delphi market fetcher (read-only)
- [ ] Phase 5 — Bull and Bear agent processes with system prompts
- [ ] Phase 6 — AXL client wrapper + protocol schemas + raw send/recv debate loop
- [ ] Phase 7 — Full duel loop runs end-to-end via CLI
- [ ] Phase 8 — Web UI with live transcript and probability bars
- [ ] Phase 9 — (Stretch) Upgrade debate turns to use /a2a/ instead of /send
- [ ] Phase 10 — Polish, README with gif, demo rehearsal

## Commands

```bash
pnpm install                       # install everything
pnpm axl:build                     # clone AXL repo + make build
pnpm axl:keys                      # openssl genpkey x2 → bull.pem, bear.pem
pnpm axl:start                     # start both AXL nodes
pnpm axl:keys-show                 # curl /topology on both, print public keys
pnpm dev:bull                      # run bull agent
pnpm dev:bear                      # run bear agent
pnpm dev:web                       # run dashboard
pnpm test:mesh                     # ping test
pnpm run-duel <market-id>          # CLI duel
```

## 4-day timeline

- **Day 1**: Phases 1-3. Critical day. If two AXL nodes are talking by end of day 1, the rest is downhill
- **Day 2**: Phases 4-6 (delphi fetch + agents + protocol + raw send/recv working duel)
- **Day 3**: Phases 7-8 (full loop polished + UI)
- **Day 4**: Phase 9 if time (a2a stretch) + Phase 10 (polish, README, gif, rehearse). Submit by deadline

If falling behind: skip Phase 9. Keep send/recv as the protocol. Skip probability bar animations. Keep the duel loop and transcript intact at all costs.

## Demo plan (90 seconds)

1. Both AXL nodes already running before pitch starts (always pre-start; never boot live)
2. Open dashboard, show two avatars, mesh status green
3. Pick a real Delphi market from a dropdown
4. Hit "Start Duel"
5. Watch transcript fill, probability bars animate, AXL message logs visible in a corner
6. Final result card: who moved more, end probabilities, full reasoning per side
7. Deliver pitch

## Pitch (90 seconds)

> Before you bet on a Delphi market, you want a second opinion. Delphi's AI settles the outcome, but who pressure-tests the prediction beforehand?
>
> Delphi Duel does. You paste any Delphi market. Two AI agents — one bull, one bear — debate it peer-to-peer over Gensyn's AXL mesh. You read the transcript before you commit a single dollar.
>
> Two separate processes. Two ed25519 identity keys. Two AXL nodes peering on localhost. Every debate turn flows through the encrypted mesh. No central server, no broker, no shortcut. Just AXL doing what it was built for.
>
> Like having two analysts on retainer who argue every trade before you make it. The bull steelmans yes. The bear steelmans no. You walk away with the strongest case for each side.
>
> Delphi is the AI prediction market. Delphi Duel is its second opinion engine.

## Things that have burned us (update as we hit them)

- (empty — fill in as bugs land)

## Things to NOT do

- Don't import bear code from bull or vice versa. AXL only
- Don't add cloud deploys. Both nodes run locally — that's the demo
- Don't build a third agent. Stick to two
- Don't add Twitter, Telegram, trading, or anything not strictly required for the demo
- Don't over-animate the UI. Clean and readable beats flashy and fragile during a live demo
- Don't ship if the AXL handshake is unreliable. Reliability beats features for a 90-second demo
- Don't try /a2a/ before /send + /recv works. /a2a/ is a Phase 9 stretch goal

## Open questions / flagged for later (post-hackathon)

- A "judge" agent on a third node who reads the debate and declares a winner
- Saved debates as shareable URLs
- Public dashboard with notable past duels
- Trader-facing email digest of high-disagreement markets
