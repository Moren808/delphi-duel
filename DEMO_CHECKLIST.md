# Demo Checklist — 90-Second Pitch

Every single thing that must work during the live pitch. Run through this **once** the day before and **once again** 30 minutes before going on.

---

## T-24 hours: dress rehearsal

- [ ] **End-to-end run from cold start succeeded.** From `pnpm axl:stop && rm -f data.db && pnpm axl:start` through to the result card appearing in the UI, no errors. Time it — should be ~75 s wall-clock for a 4-turn duel.
- [ ] **Rehearsed on at least 3 different demo markets.** Crypto exploit, US/Iran peace, BTC range. You want to know which one tells the story best (sharpest disagreement / cleanest convergence).
- [ ] **Decided which market is the live demo.** Backup market chosen too, in case the primary has settled or moved overnight.
- [ ] **Pitch script timed out loud.** Under 90 seconds, including 5 s of "Delphi Duel solves X" framing at the start.
- [ ] **Screen recording made of one full successful run.** Lives in `~/demo-fallback.mp4`. If anything fails live, you cut to it.
- [ ] **Backup duel transcript saved** as a screenshot of the result card in case the network completely fails. `~/demo-fallback-result.png`.

## T-12 hours: cred & supply checks

- [ ] **Delphi API key still valid.** `pnpm list-markets` returns markets, no 401. (Keys can be rotated by Delphi without notice.)
- [ ] **Anthropic API key still valid + has quota.** `curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'` returns 200.
- [ ] **Demo market still OPEN, not settled.** Run `pnpm fetch-market <id>` and confirm `close_date` is in the future.
- [ ] **Laptop charger packed.** Dual A/C adapter. Don't run on battery — Claude calls under thermal throttling are noticeably slower.
- [ ] **Phone hotspot tested as venue-wifi backup.** Measured throughput >5 Mbps.

## T-30 min: pre-flight at the venue

### Hardware
- [ ] Laptop on AC power
- [ ] External monitor / projector connection working (one extra cable in the bag)
- [ ] System sleep / display sleep disabled (`caffeinate -dimsu` running in a terminal)
- [ ] Notifications muted (DND on, no Slack/iMessage popups)
- [ ] Keyboard backlight + screen brightness at audience-readable levels

### Software state
- [ ] **Network test:** `curl -s https://api.delphi.fyi/health` returns `{"status":"ok"}`. `curl -s https://api.anthropic.com` returns *anything* (proves DNS + TLS work).
- [ ] **Old data.db purged or backed up:** `mv data.db data.db.bak` so the new duel writes from a clean start (more dramatic visuals — no leftover summary card flashing on page-load).
- [ ] **Mesh restarted clean:** `pnpm axl:stop && pnpm axl:start && pnpm axl:probe`. Confirm `axl/keys/public-keys.json` written.
- [ ] **Mesh fully peered:** `curl -s http://127.0.0.1:9002/topology | jq '.peers[0].up'` returns `true`. Same for 9012.
- [ ] **Web UI running:** `pnpm dev:web` started, port 3000 free, "Ready in Xs" printed.
- [ ] **Browser tab loaded** at `http://localhost:3000`. Refreshed once. Both mesh-status dots green; "peered" pill visible.
- [ ] **Pre-warm Claude:** run one practice duel (`pnpm run-duel <other-market-id>`) — first call of the day is sometimes 2× slower because Anthropic just spun up a worker for you.
- [ ] **Then purge data.db again** so the practice run doesn't show on the demo screen.

### Window arrangement
- [ ] Full-screen Chrome on the demo browser window
- [ ] Single small terminal visible somewhere on screen showing AXL node logs (`tail -f axl/logs/node-1.log axl/logs/node-2.log`) — proves the mesh is real
- [ ] Hide everything else (close other tabs, unused windows)
- [ ] Pinch-zoomed browser to ~125% so the audience can read the transcript
- [ ] Test that the result card fits without scrolling at the chosen market

## During the pitch

### Frame 1: framing (0–10 s)
- [ ] Open with the one-liner: *"Before you bet on a Delphi market, you want a second opinion. That's what this is."*
- [ ] Browser is already loaded; mesh status is green; do **not** show a refresh.

### Frame 2: pick a market (10–20 s)
- [ ] Click the market dropdown
- [ ] Audience can read the question in the dropdown (tested zoom level)
- [ ] Select the demo market
- [ ] Market title strip appears below the picker

### Frame 3: start duel (20–25 s)
- [ ] Click **start duel**
- [ ] Spinner replaces the play icon for ~1 s
- [ ] Mention out loud: *"Two separate processes. Two AXL nodes. Two ed25519 keys. They're talking peer-to-peer over Gensyn AXL right now."*

### Frame 4: round 0 — bull (25–40 s)
- [ ] Bull's avatar starts pulsing within 1 s
- [ ] Bull's probability number appears (~10–18 s after click)
- [ ] Bar fills with framer-motion ease
- [ ] AXL log row appears: `[HH:MM:SS] bull → bear : turn r0 (XXX B)`
- [ ] Transcript card slides in showing bull's `message_to_peer`

### Frame 5: round 1 — bear (40–55 s)
- [ ] Bear's avatar pulses
- [ ] Bear's probability appears
- [ ] AXL log row for bear's reply
- [ ] Transcript card slides in

### Frame 6: rounds 2 + 3 (55–75 s)
- [ ] Both probability numbers update visibly
- [ ] At least one of them changes by more than 0.05 (otherwise the demo is undramatic)
- [ ] Final two transcript cards land

### Frame 7: result + close (75–90 s)
- [ ] **Result card appears.** Verdict line is the punchline of the demo.
- [ ] Read the verdict out loud.
- [ ] Close: *"Two analysts on retainer, debating every trade before you make it. That's Delphi Duel."*

## Things that should NOT happen during the demo

- [ ] No browser console errors visible (have devtools closed unless asked)
- [ ] No Next.js error overlay (red full-screen modal). If you see one mid-demo, hit `Esc` immediately and keep going.
- [ ] No `429` from Anthropic. Pre-warm avoided this; backup plan is the recording.
- [ ] No `409 duel already running`. Only press Start Duel once. If the button is grey, you've already started — wait.
- [ ] No "mesh not ready — starting via axl/scripts/start-mesh.sh" stderr. Pre-flight covered this.
- [ ] No `claude-sonnet-4-20250514` deprecation 4xx. Re-test the day-of.
- [ ] No mid-duel ctrl+c. If something goes wrong, let it finish — even a bad duel demonstrates the mesh works.

## If something fails

- **AXL nodes won't peer:** `pnpm axl:stop`, kill any stale `node` processes (`pkill -f axl-repo/node`), `pnpm axl:start`, wait 10 s, `pnpm axl:probe`. ~30 s recovery.
- **Anthropic 5xx:** can't recover. Switch to the recording.
- **Delphi 401:** market metadata couldn't load. Switch to a different market (try `0xc81b47c859a8b8290c3931d46562b547d283d3f4`, the crypto-exploit one — it was working as recently as the last rehearsal).
- **Web UI white-screens:** alt-tab to the terminal, `Ctrl+C` Next.js, `pnpm dev:web` again. Costs ~10 s. Don't refresh during a duel — the polling loop will pick the duel back up after refresh, but the audience won't know that.
- **Probability bars don't animate:** unlikely (CSS-driven). Continue — verdict still lands at the end.
- **Result card never shows:** check `data.db` has 4 rows (`sqlite3 data.db "SELECT round, role, is_final FROM turns ORDER BY produced_at DESC LIMIT 4"`). If only 3, an agent crashed; check `axl/logs/node-*.log`. If you see this >5 s after the last AXL log row, switch to the recording.

## After the pitch

- [ ] Note any audience reaction / question to feed into post-hackathon iteration
- [ ] Save the data.db from the live demo (`cp data.db data.db.live-demo`) — has the actual duel transcript
- [ ] Take a screenshot of the final result card
- [ ] Stop the dev server, stop the mesh
- [ ] Take a deep breath
