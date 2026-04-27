# Phase 0 — Prep Checklist (Delphi Duel)

You have **4 days**. Spend ~1 hour on this prep, then build.

This list is short on purpose. We cut everything not strictly needed: no Twitter, no Telegram, no Fly.io, no mainnet wallets, no trading.

---

## 1. Accounts and keys

- [ ] **Anthropic API key** — console.anthropic.com → API Keys → create one named "delphi-duel". Set a $30-50 spend cap. Both agents call this key, ~50 test runs at 5 rounds each is well under $30
- [ ] **GitHub repo** — create `delphi-duel` private repo. Push as you go

That's it.

## 2. Delphi info

- [ ] **SDK package**: `@gensyn-ai/gensyn-delphi-sdk` (TypeScript only, npm)
- [ ] **Delphi SDK docs** — `https://docs.gensyn.ai/tech/delphi-sdk` open in tab. Note: SDK has a REST client (read) and on-chain methods (write). We use READ ONLY
- [ ] **Pick 5 live markets** as demo material. Open `app.delphi.fyi`. For each save:
  - market ID and full URL
  - resolution prompt (verbatim)
  - outcomes
  - current implied probabilities
  - close date
  
  Mix: 2 crypto, 1 sports, 1 AI/tech, 1 current event. Variety means richer demo

## 3. AXL setup

- [ ] **Install Go 1.25.5+** — `brew install go` then verify `go version`. AXL pins Go 1.25.5; older versions won't build. If brew gives you something older, install via `brew install go@1.25` or download from go.dev directly
- [ ] **Verify openssl is available** — `openssl version` should print something. Pre-installed on Mac. Used to generate ed25519 identity keys
- [ ] **AXL repo** — `https://github.com/gensyn-ai/axl` open in tab. Read README and AGENTS.md once. Don't try to deeply understand — Claude Code handles the build. Just absorb:
  - HTTP API at `127.0.0.1:9002` by default (configurable per node)
  - Three core endpoints: `/send`, `/recv`, `/topology`
  - Two protocol endpoints: `/a2a/{peer_id}`, `/mcp/{peer_id}/{service}`
  - Identity = ed25519 keypair via `openssl genpkey -algorithm ed25519`
- [ ] **AXL docs** — `https://docs.gensyn.ai/tech/agent-exchange-layer` — 5 min skim. Already covered above

## 4. Local environment

- [ ] **Node 20+** — `node -v`
- [ ] **pnpm** — `npm i -g pnpm`
- [ ] **Go 1.25.5+** — `go version`
- [ ] **openssl** — `openssl version`
- [ ] **make** — `make -v` (xcode-select --install if missing on Mac)
- [ ] **Claude Code desktop** — already installed
- [ ] **VS Code or Cursor** — open beside Claude Code for inspecting files
- [ ] **A multi-pane terminal** (iTerm or default Mac Terminal with split panes via View → Show Tab Bar then ⌘D) so you can watch both AXL node logs side by side

## 5. Pre-write your prompts (saves 1-2 hours)

In a scratch file, draft these so you can paste cleanly into Claude Code:

- [ ] **Bull system prompt** — "You are the Bull, a debate agent for Delphi prediction markets. You always argue the YES side. Be principled, evidence-based — you steelman YES with the strongest available case. Given a market (resolution prompt, outcomes), the round number, and your peer Bear's last argument, return strict JSON: { probability: number 0-1, confidence: number 0-1, reasoning: string, message_to_peer: string }. Be specific, cite evidence. Don't repeat yourself across rounds. Update your probability when Bear's argument is genuinely strong — but stay in character as the YES advocate."

- [ ] **Bear system prompt** — same shape, mirror to NO

- [ ] **5 demo market scripts** — for each picked market, one-liner of expected demo flow ("BTC hitting 200k market — bull starts ~0.6, bear ~0.3, expect bull to drop ~0.1 by round 5 if bear cites historical resistance levels")

## 6. Demo target

- [ ] **90-second pitch** with the demo running in background
- [ ] **Both AXL nodes pre-started** before the demo (don't boot live)
- [ ] **Pre-pick a fallback market** in case your first choice misbehaves
- [ ] Pitch already in CLAUDE.md — say it out loud once on day 1 to start memorizing

## 7. Last sanity check

- [ ] Anthropic key + spend cap set?
- [ ] Go is **1.25.5+** (not 1.21)?
- [ ] openssl works?
- [ ] 5 demo markets saved with their IDs and URLs?
- [ ] CLAUDE.md, BUILD_GUIDE.md ready in your project folder?
- [ ] You've skimmed the AXL README and AGENTS.md?
- [ ] You understand: two processes, two AXL nodes peering on localhost, debating a Delphi market via /send + /recv (with /a2a/ as stretch)?

---

When all checked, open Claude Code, attach the project folder, and start at Day 1 of BUILD_GUIDE.md.

The hackathon is won by **AXL working between two nodes + a demo that doesn't crash**. Everything else is polish. Stay focused.

Ship it.
