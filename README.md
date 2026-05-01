# Delphi Duel

**The second opinion engine for Delphi prediction markets.**

Before you bet on any Delphi market, two AI agents debate it peer-to-peer over Gensyn's AXL mesh. A third judge node reads the full debate and delivers a verdict. **Three nodes. Two debaters. One judge.**

[![ETHGlobal Open Agents 2026](https://img.shields.io/badge/ETHGlobal-Open%20Agents%202026-000?style=flat-square)](https://ethglobal.com/)
[![Gensyn AXL track](https://img.shields.io/badge/Gensyn-AXL%20track-22c55e?style=flat-square)](https://github.com/gensyn-ai/axl)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## Why this matters

- **Polymarket and Kalshi let you bet, but they don't help you think through both sides.** You see the price, the volume, and a comment thread. The thinking is your problem.
- **Delphi settles markets with AI.** The analysis going *in* should also be AI-driven — not vibes-from-Twitter and not whoever shouted last on the order book.
- **Delphi Duel forces a structured adversarial debate before you commit capital.** Two agents argue opposite sides for several rounds. A third agent — the judge — reads the full transcript and tells you what the debate actually established. You walk away with the strongest case for each side and a verdict, not a hot take.

---

## What's new

**Binary AND multi-outcome market support.** "Will X happen by Y?" works as it always did — two agents take YES/NO. For markets with three or more outcomes — *2026 NBA Champion*, *2026 FIFA World Cup Winner*, *2026 F1 Drivers' Champion* — you pick **any two outcomes** to compare head-to-head: *Argentina vs England*, *OKC vs Lakers*. The probabilities each agent reports are now `P(my outcome wins)` and don't sum to 1, because other outcomes can absorb mass. Both agents can be losing ground.

**Three-node AXL architecture.** Bull on `api :9002`, bear on `api :9012`, judge on `api :9022`. Bull is the listener at `tls://127.0.0.1:9001`; bear and judge dial out to it. All three are independent OS processes with their own ed25519 identity keys. **No agent imports another agent's directory.** All inter-agent communication crosses the mesh.

**Judge node.** An independent third AXL node receives the full debate transcript via `/send` after both agents produce `is_final`. It calls Claude with a verdict prompt — distinct from the debater prompts — and returns:

- `winner`: `bull`, `bear`, or `inconclusive`
- `confidence`: `0.0`–`1.0`
- `reasoning`: 2–3 sentence paragraph the trader sees
- `recommended_position`: `STRONG YES` / `MODERATE YES` / `NEUTRAL` / `MODERATE NO` / `STRONG NO`

The judge's prompt explicitly weighs evidence quality over the agents' own confidence claims.

**Outcome names everywhere.** In multi-outcome markets the UI shows "**ENGLAND WINS THE DEBATE**" instead of "BEAR WINS". The verdict text reads "Lakers holds at 0.39 — stronger case than OKC (0.22)" instead of "agents disagree, bull at 0.39, bear at 0.22". Real names, not role abstractions.

**Live Delphi mainnet data.** Markets, outcomes, implied probabilities, and resolution dates are pulled live from `@gensyn-ai/gensyn-delphi-sdk` against mainnet. Subgraph trade history derives the implied probability per outcome at fetch time.

---

## Architecture

```mermaid
flowchart TB
    subgraph mesh["AXL mesh — Yggdrasil-routed TLS, localhost only"]
        N1["AXL node 1 (bull)<br/>tls://127.0.0.1:9001 listen<br/>HTTP api :9002"]
        N2["AXL node 2 (bear)<br/>HTTP api :9012<br/>peers → 9001"]
        N3["AXL node 3 (judge)<br/>HTTP api :9022<br/>peers → 9001"]
        N1 <-.->|TLS| N2
        N1 <-.->|TLS| N3
    end

    Bull[Bull agent<br/>Node.js process]
    Bear[Bear agent<br/>Node.js process]
    Judge[Judge agent<br/>Node.js process]

    Bull <-->|HTTP /send /recv /topology| N1
    Bear <-->|HTTP /send /recv /topology| N2
    Judge <-->|HTTP /send /recv /topology| N3

    Bull --> |insert turn| DB[(SQLite<br/>data.db)]
    Bear --> |insert turn| DB
    Judge --> |insert verdict| DB

    Web[Next.js web UI<br/>localhost:3000]
    Web --> |SELECT| DB
    Web --> |/api/mesh-status| N1
    Web --> |/api/mesh-status| N2
    Web --> |/api/mesh-status| N3
    User((trader)) --> Web

    Anthropic[(Anthropic Claude Sonnet)]
    Bull -.-> Anthropic
    Bear -.-> Anthropic
    Judge -.-> Anthropic

    Delphi[(Delphi REST + Goldsky subgraph)]
    Bull -.-> |fetchMarket| Delphi
```

**Duel flow.** Bull mints a `duel_id` and opens with round 0 → bear `/recv`s, calls Claude, replies → alternate for N rounds → after both `is_final`s land, bull reads the full transcript from SQLite and ships it to judge with one `/send` → judge calls Claude with the verdict prompt, writes to SQLite, optionally relays the verdict back to bull.

The judge is a long-running daemon — it polls `/recv` indefinitely and processes whichever transcripts arrive. Same daemon serves multiple duels.

---

## AXL integration

The duel uses three AXL endpoints. Every byte exchanged between the agents flows through this surface — there is no direct HTTP, IPC, or file channel between bull, bear, and judge.

| Endpoint | Direction | Why |
|---|---|---|
| `POST /send` | producer → its own AXL node → peer | Bull and bear push turns (JSON `TurnRecord`) to each other's pubkey via `X-Destination-Peer-Id`. After `is_final`, bull broadcasts the assembled transcript to the judge's pubkey using the same endpoint. Fire-and-forget; AXL queues at the receiver. |
| `GET /recv` | consumer ← its own AXL node | Bear polls for inbound debate turns. Judge polls for inbound transcripts. Bull polls for the bear's response and (optionally) the judge's verdict relay. Returns `204` when empty, `200` with body + `X-From-Peer-Id` header when a message is waiting. 500 ms polling cadence. |
| `GET /topology` | each agent ← its own AXL node | Used at startup to confirm the local node reports the expected `our_public_key` (fails fast if we accidentally picked up the wrong identity key) and that the peer is reachable (`peers[*].up == true`). The web UI's mesh status indicator hits this on all three ports every 5 s. |

**Three separate processes, three ed25519 identity keys, zero direct imports between agents.** If you grep for `from "@delphi-duel/judge"` inside `agents/bull/`, `agents/bear/`, or `agents/shared/`, you'll find nothing — the only way bull learns the judge exists is by reading `axl/keys/public-keys.json` for the destination pubkey it should `/send` to.

**Identity verification.** `axl/keys/public-keys.json` records, for each of the three agents, both the full ed25519 `pubkey` (used as `X-Destination-Peer-Id` for outbound `/send`) and the AXL-derived `axl_peer_id` (a 64-char hex value the receiver sees on `X-From-Peer-Id`). The two are not equal: AXL derives the receiver-side ID from the sender's Yggdrasil IPv6, which only encodes a prefix of the pubkey. The mismatch is by design and documented in [`AGENTS.md`](AGENTS.md).

---

## Run it locally

Prereqs: Node 20+, pnpm, Go 1.25+, OpenSSL 3 with ed25519 (Homebrew `openssl@3` on macOS — LibreSSL won't work).

```bash
# 1. Install dependencies
pnpm install

# 2. Configure secrets (gitignored)
#    Get a Delphi mainnet API key:  https://api-access.delphi.fyi
#    Get an Anthropic API key:       https://console.anthropic.com
cat > .env.local <<EOF
DELPHI_API_ACCESS_KEY=...
DELPHI_NETWORK=mainnet
ANTHROPIC_API_KEY=...
EOF

# 3. Build the AXL Go binary (clones gensyn-ai/axl + make build, idempotent)
pnpm axl:build

# 4. Generate THREE ed25519 identity keys: bull.pem, bear.pem, judge.pem
#    (also writes axl/node-config-{1,2,3}.json with absolute key paths)
pnpm axl:keys

# 5. Start all three AXL nodes (bull / bear / judge) in the background
pnpm axl:start
pnpm axl:probe                # capture pubkey + axl_peer_id for all three

# 6. Run a duel from the CLI...
pnpm run-duel                                                 # picks a random market
pnpm run-duel 0xc81b47c859a8b8290c3931d46562b547d283d3f4      # specific market

# ...or run the web UI (start the judge daemon first so the verdict card lands live)
pnpm dev:judge &
pnpm dev:web
# → http://localhost:3000

# When done:
pnpm axl:stop
```

For multi-outcome head-to-head from the CLI:

```bash
DELPHI_BULL_OUTCOME="Oklahoma City Thunder" \
DELPHI_BEAR_OUTCOME="Los Angeles Lakers" \
pnpm run-duel 0x3e43eee0ccb9ce348eb5d4d0eba29ef4a4e4572d
```

Other useful commands:

```bash
pnpm test:mesh                   # bull → bear ping over /send + /recv (no LLM calls)
pnpm list-markets                # browse open Delphi mainnet markets
pnpm fetch-market <id>           # render any market in canonical Market shape
```

For the live-pitch run-book and demo recovery procedures, see [`DEMO.md`](DEMO.md).
For adding new specialist agents and judge-prompt contribution rules, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Live demo results

Real duels run against live Delphi mainnet markets. Every value below is read directly from `data.db`; the reasoning paragraphs are verbatim from the judge agent.

### 🏆 2026 FIFA World Cup — Argentina vs England (multi-outcome head-to-head)

| Round | Side | Outcome | P(my outcome wins) |
|---|---|---|---|
| 0 | Bull | Argentina | 0.32 |
| 1 | Bear | England   | 0.28 |
| 2 | Bull | Argentina | 0.22 |
| 3 | Bear | England   | 0.26 |

**Judge verdict: England wins the debate, 72% confidence, recommended position MODERATE NO on Argentina.**

> Bear effectively countered Bull's system-evolution argument by highlighting the irreplaceable nature of Messi's individual impact, while Bull never adequately addressed the core aging concern that drove their own probability down from 0.32 to 0.22. Bear's point about England's steady tournament improvement trajectory versus Argentina's unprecedented challenge of replacing Messi's clutch moments proved decisive.

Both agents moved DOWN from their openings — the correct behaviour in multi-outcome mode. As bear weakened bull's case, mass flowed away from Argentina without flowing to England; other countries absorbed it.

### 🏛️ US × Iran permanent peace deal by May 31, 2026 (binary, near-term)

| Round | Side | P(YES) |
|---|---|---|
| 0 | Bull (YES) | 0.45 |
| 1 | Bear (NO)  | 0.08 |
| 2 | Bull (YES) | 0.42 |
| 3 | Bear (NO)  | 0.12 |

**Judge verdict: Bear wins, 75% confidence, recommended position MODERATE NO.**

The widest final disagreement gap of any duel run so far (0.30). Bull never recovered from bear's opening framing of "permanent peace deal" as definitionally near-impossible inside the timeline. The verdict surfaces non-trivial information beyond the market consensus — Delphi was pricing this at 39% YES at fetch time, well above what either agent ended at.

---

## Roadmap

- **Autonomous trading agent.** A fourth AXL node — the trader — receives the judge's verdict, sizes a position by `confidence × magnitude`, places it on Delphi mainnet via `quoteBuy` + `buyShares`, and writes the trade record back to SQLite. The full loop: debate, judge, bet — no human in the middle. Hard part is the kill switch and the loss budget, not the trade execution.

- **Cross-machine nodes.** Move bull, bear, and judge to three separate cloud VMs to prove AXL works across the open internet rather than just on `127.0.0.1`. Yggdrasil's mesh routing handles NAT traversal natively — the agent code shouldn't need to change. Demonstrates the "no central server" claim in a way that's hard to wave away.

- **Reputation scoring.** Track per-agent accuracy by market category over time. Once enough markets resolve, we can score "did the duel surface the right side?" and weight verdicts on future debates by the agents' historical hit rate in that category. Subgraph integration to detect resolved markets is the unblock.

---

## Tech stack

| Layer | Choice |
|---|---|
| Mesh | [Gensyn AXL](https://github.com/gensyn-ai/axl) Go binary, three nodes, ed25519 keypairs |
| Agents | Node.js 20 + TypeScript, three separate processes |
| AI | Anthropic API, `claude-sonnet-4-20250514`, strict-JSON output validated with [zod](https://github.com/colinhacks/zod) |
| Market data | [`@gensyn-ai/gensyn-delphi-sdk`](https://github.com/gensyn-ai/gensyn-delphi-sdk), read-only mainnet |
| Frontend | Next.js 14 (app router), Tailwind, shadcn/ui patterns, [framer-motion](https://www.framer.com/motion/), [lucide-react](https://lucide.dev) |
| Database | SQLite via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), WAL mode for cross-process writes |
| Orchestrator | `pnpm run-duel` — single command, full flow including mesh readiness check + verdict |
| Workspaces | pnpm |

---

## Built by

**Moren** ([@Moren808](https://github.com/Moren808)) — solo, four days, ETHGlobal Open Agents 2026.

## License

MIT — see [`LICENSE`](LICENSE).
