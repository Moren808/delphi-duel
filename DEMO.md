# Demo Guide

Everything needed to run the live Delphi Duel pitch — from cold-machine setup through the 90-second script.

For the granular failure-mode pre-flight (T-24h / T-12h / T-30min checklist), see [`DEMO_CHECKLIST.md`](DEMO_CHECKLIST.md). This file is the **scenario script** and **what to say**; the checklist is **what to verify before going on**.

---

## 0 · Quick mental model for judges in the audience

> Two AI agents debating a real prediction market peer-to-peer over Gensyn AXL, then a third AI judge reading the transcript and issuing a verdict. **All three agents are separate OS processes on three separate AXL nodes** — there is no central broker.

That's the whole pitch. The rest of this document is the choreography that lets that sentence land in 90 seconds.

---

## 1 · Setup the morning of the demo

### Hardware
- Laptop on AC power, fully charged
- External monitor / projector cable + a backup adapter
- Phone hotspot tethered, tested at >5 Mbps (the venue wifi will betray you)
- System sleep disabled: open a terminal and run `caffeinate -dimsu`

### Environment
```bash
# 1. Pull latest
git pull --rebase

# 2. Confirm secrets are loaded
cat .env.local
# Expect:
#   DELPHI_API_ACCESS_KEY=...
#   DELPHI_NETWORK=mainnet
#   ANTHROPIC_API_KEY=...

# 3. Build AXL binary (idempotent — skips if already built)
pnpm axl:build

# 4. Generate ed25519 keys for bull, bear, judge (idempotent)
pnpm axl:keys

# 5. Start the three-node mesh
pnpm axl:stop                       # belt-and-suspenders if anything's stuck
pnpm axl:start                      # spawns bull (9002) / bear (9012) / judge (9022)
sleep 5
pnpm axl:probe                      # probes each peer, writes axl/keys/public-keys.json

# 6. Verify all three nodes are up + peering
curl -s http://127.0.0.1:9002/topology | jq '.peers[0].up'    # → true
curl -s http://127.0.0.1:9012/topology | jq '.peers[0].up'    # → true
curl -s http://127.0.0.1:9022/topology | jq '.peers[0].up'    # → true

# 7. Start the judge daemon (long-lived process — survives across duels)
pnpm dev:judge &

# 8. Pre-warm Anthropic by running one practice duel
#    (first call of the day is sometimes 2× slower; this kills that)
pnpm run-duel 0xc81b47c859a8b8290c3931d46562b547d283d3f4

# 9. Purge data.db so the demo starts on a clean slate
rm -f data.db data.db-shm data.db-wal

# 10. Start the web UI
pnpm dev:web
# → http://localhost:3000
```

### Window layout for the live demo
- **Full-screen Chrome at `http://localhost:3000`** (the dashboard) — primary
- **Small terminal on the side** running `tail -f axl/logs/node-1.log axl/logs/node-2.log axl/logs/node-3.log` — proves the mesh is real if a judge asks
- Browser zoom at **125%** so the back row can read the transcript
- DND on, Slack/iMessage closed, notifications muted

### Backup if anything fails live
- Pre-recorded 60-second screen capture saved at `~/demo-fallback.mp4` — jump to it if Anthropic 5xxs mid-demo
- Last good `data.db` backed up at `~/data.db.last-known-good` — restore + click "view example duel" if all else fails
- The deployed Vercel URL `https://delphi-duel.vercel.app` always serves the recorded fixture in demo mode — bookmarked

---

## 2 · The 90-second pitch script

Read this aloud once before going on. Total target: **90 seconds**, give or take 5.

> ### 0:00 – 0:10 · The framing
> "Before you bet on a Delphi market, you want a second opinion. Delphi's own AI settles the outcome at the end. But who pressure-tests the prediction *beforehand* — when you're about to put down real money?"

> ### 0:10 – 0:25 · The product
> "**Delphi Duel** does. You paste any Delphi market" — *click the dropdown, pick the crypto exploit market* — "two AI agents debate it for you. One argues yes, one argues no. They run in two separate OS processes, talking to each other peer-to-peer over Gensyn's **AXL** mesh." — *click* `start duel` —

> ### 0:25 – 0:60 · The action
> *while the duel runs, narrate over it*
>
> "Bull's reasoning lands first." — *bull's probability number paints in* — "Bear sees the message over `/recv`, calls Claude, replies." — *bear card animates* — "Watch the AXL log on the right" — *gesture to the side terminal or the AXL panel* — "every line is a real `/send` and `/recv` between two separate Yggdrasil-routed nodes. No central server. No broker."
>
> *as the third / fourth turn lands*
>
> "And here's the third agent — the **judge** — running on its own AXL node. It just received the full transcript from bull and is about to issue a verdict."

> ### 0:60 – 0:80 · The result
> *result card + verdict card render*
>
> "**[winner] wins the debate, [confidence]% confidence.** Look at the reasoning the judge gave us." — *read the first sentence of the verdict aloud* — "That's the trader's brief — three minutes of debate, condensed into one paragraph and a recommended position."

> ### 0:80 – 0:90 · The close
> "Two separate processes. Three ed25519 identity keys. Three AXL nodes peering on localhost. Every byte between agents flows through the mesh — exactly what AXL was built for."
>
> "Delphi is the AI prediction market. **Delphi Duel is its second-opinion engine.**"

---

## 3 · Choreography frame-by-frame

What happens on screen during the live duel, with cues for what to say.

| Frame | Time | What's on screen | What to say |
|---|---|---|---|
| 1 | 0:00 | Dashboard already loaded. Logo. Mesh chip green: `bull :9002 ● bear :9012 ● judge :9022 PEERED`. Three filter pills + market dropdown. | The framing |
| 2 | 0:15 | Click market dropdown. Pick the crypto-exploit market (binary YES/NO is the cleanest demo). | "Two AI agents debate it for you" |
| 3 | 0:20 | Market summary card visible — implied P(YES) 31.5%, resolves in 30 days. | "Currently the market thinks 32%, end of May" |
| 4 | 0:22 | Click `start duel`. Spinner replaces play icon for 1s. | "Two separate OS processes, peer-to-peer over AXL" |
| 5 | 0:25 | Bull avatar pulses (thinking…). | (silence — let it land) |
| 6 | 0:35 | Bull's P(YES) number paints in (≈0.65). Bar fills with framer-motion ease. AXL log: `[HH:MM:SS] bull → bear : turn r0 (314 B)`. Transcript card slides in. | "Bull's reasoning lands first" |
| 7 | 0:42 | Bear avatar pulses. | "Bear sees it over /recv" |
| 8 | 0:50 | Bear's number lands (≈0.22). | "Calls Claude, replies — already 40 points apart" |
| 9 | 0:55 | Bull again, then bear again. Final turns flagged with `final` chip. | "Watch them update — bear comes up to 0.42 after bull lands a punch" |
| 10 | 1:10 | Result card renders. "Final disagreement" gap shown. | (gesture to it but don't slow down) |
| 11 | 1:15 | Black Judge Verdict card appears. **"BULL WINS"**, 70% confidence, recommended position **MODERATE YES**. | "Third agent — the judge — running on its own AXL node" |
| 12 | 1:25 | Read first sentence of the verdict reasoning aloud. | "That's your brief" |
| 13 | 1:30 | Land the close. | "Two separate processes…" |

---

## 4 · Backup demos (have these ready)

### 4a · Multi-outcome head-to-head (FIFA World Cup)
Use this if the audience seems sports-leaning, or if you want to showcase the "head-to-head" feature.

```bash
# Click FIFA World Cup in the picker.
# In the outcome row that appears, leave defaults: Argentina vs England.
# Click start duel.
```

This produces the demo result documented in `README.md`: bear (England) wins, 72% confidence, with the judge calling out Messi's irreplaceable individual impact. Strong visual — the `BULL WINS` label becomes `LOS ANGELES LAKERS WINS THE DEBATE` (or `ENGLAND WINS THE DEBATE`).

### 4b · The recorded fixture (offline-safe)
Click `view example duel` instead of `start duel`. Uses a baked-in transcript and verdict from a previous real duel — runs instantly, doesn't hit Anthropic, doesn't need the AXL mesh to be live. **This is what the Vercel deployment shows.** Use it if the network betrays you.

### 4c · Politics market (US × Iran peace deal)
The widest gap of any duel we've run (0.30) — bull opens at 0.45, bear lands an opening framing of "permanent peace deal" as definitionally near-impossible, and bull never recovers. Useful to show the verdict text "agents disagree" when both sides genuinely don't.

---

## 5 · Q&A — anticipated questions, scripted answers

> **Why three nodes and not two?**
> So the judge is structurally separated from the agents. Bull and bear could be running collusively or sharing state — the judge can't be, by construction, because it's a third AXL identity that only sees what's been broadcast over the mesh.

> **Couldn't this just be one process?**
> It could. We chose not to. Cross-process gives us peer identity verification (ed25519 keys), AXL transport stress-testing, and proves the judge has no privileged access to bull's or bear's internal state. It's the difference between "agents collaborate" and "agents debate."

> **What stops the agents from making things up?**
> Nothing — they're language models. Read the system prompt at `agents/bull/system-prompt.md`: we explicitly tell them they have no live data and to hedge specific claims. They mostly listen. The judge's `recommended_position` is what the trader should anchor on, not the agents' specific claimed facts.

> **Could this run on testnet?**
> Yes. Set `DELPHI_NETWORK=testnet` in `.env.local` and use a testnet API key from `delphi-api-access.gensyn.ai`. The mesh and judge work identically — only the source of market data changes.

> **What's the latency profile?**
> ~75 seconds wall-clock for a 4-turn duel + ~12s for the judge. Anthropic Claude Sonnet calls dominate. Each AXL `/send` + `/recv` round-trip is sub-100ms.

> **What if the agents agree?**
> The verdict reads "both agents lean YES/NO" and the recommendation is sized accordingly. The product still has value — high agreement *with reasoning* is informative even without disagreement.

---

## 6 · After the demo

- Save the live-demo `data.db` for the post-mortem: `cp data.db data.db.live-demo-$(date +%s)`
- Screenshot the final result + verdict cards
- Note any audience question that surprised you — that's roadmap input
- `pnpm axl:stop` — clean shutdown
- Take a deep breath
