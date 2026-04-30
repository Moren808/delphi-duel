#!/usr/bin/env bash
# Capture all three peers' identities into axl/keys/public-keys.json.
#
# For each peer we record two values:
#   pubkey      — full ed25519 public key, used as X-Destination-Peer-Id for /send
#   axl_peer_id — AXL-derived peer ID seen by the other side on /recv
#                 (a 64-char hex derived from the sender's Yggdrasil IPv6)
#
# Both values are necessary because /send takes the pubkey but /recv reports
# only the IPv6-derived ID, which is a lossy prefix-match of the pubkey.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AXL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYS_DIR="$AXL_DIR/keys"
OUT="$KEYS_DIR/public-keys.json"

BULL_API="http://127.0.0.1:9002"
BEAR_API="http://127.0.0.1:9012"
JUDGE_API="http://127.0.0.1:9022"

mkdir -p "$KEYS_DIR"

for api in "$BULL_API" "$BEAR_API" "$JUDGE_API"; do
  if ! curl -sf "$api/topology" > /dev/null; then
    echo "ERROR: cannot reach $api/topology — is the mesh running? (pnpm axl:start)" >&2
    exit 1
  fi
done

echo "Waiting 5s for Yggdrasil mesh to settle..."
sleep 5

BULL_PK=$(curl -s  "$BULL_API/topology"  | jq -r .our_public_key)
BEAR_PK=$(curl -s  "$BEAR_API/topology"  | jq -r .our_public_key)
JUDGE_PK=$(curl -s "$JUDGE_API/topology" | jq -r .our_public_key)

echo "Bull pubkey:  $BULL_PK"
echo "Bear pubkey:  $BEAR_PK"
echo "Judge pubkey: $JUDGE_PK"

# Drain any stale messages on all three /recv queues so we don't read garbage.
drain() {
  local api="$1"
  for _ in $(seq 1 50); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$api/recv")
    [ "$code" = "204" ] && break
  done
}
drain "$BULL_API"
drain "$BEAR_API"
drain "$JUDGE_API"

# Helper: send `payload` from $1_API to $2_PK, then read X-From-Peer-Id at $2_API
probe_recv() {
  local from_api="$1"
  local to_pk="$2"
  local to_api="$3"
  local label="$4"
  curl -sf -X POST -H "X-Destination-Peer-Id: $to_pk" --data-binary "$label" "$from_api/send" > /dev/null
  sleep 1
  curl -s -D - -o /dev/null "$to_api/recv" | awk -F': ' 'BEGIN{IGNORECASE=1} /^X-From-Peer-Id/ {print $2}' | tr -d '\r\n'
}

# Bull's axl_peer_id = what bear sees when bull sends.
BULL_DERIVED=$(probe_recv "$BULL_API" "$BEAR_PK" "$BEAR_API" "probe-bull")

# Bear's axl_peer_id = what bull sees when bear sends.
BEAR_DERIVED=$(probe_recv "$BEAR_API" "$BULL_PK" "$BULL_API" "probe-bear")

# Judge's axl_peer_id = what bull sees when judge sends.
JUDGE_DERIVED=$(probe_recv "$JUDGE_API" "$BULL_PK" "$BULL_API" "probe-judge")

if [ -z "$BULL_DERIVED" ] || [ -z "$BEAR_DERIVED" ] || [ -z "$JUDGE_DERIVED" ]; then
  echo "ERROR: failed to capture one or more axl_peer_id values" >&2
  echo "  bull_derived=$BULL_DERIVED" >&2
  echo "  bear_derived=$BEAR_DERIVED" >&2
  echo "  judge_derived=$JUDGE_DERIVED" >&2
  exit 1
fi

jq -n \
  --arg bp "$BULL_PK"  --arg bd "$BULL_DERIVED" \
  --arg ep "$BEAR_PK"  --arg ed "$BEAR_DERIVED" \
  --arg jp "$JUDGE_PK" --arg jd "$JUDGE_DERIVED" \
  '{
     bull:  {pubkey:$bp, axl_peer_id:$bd},
     bear:  {pubkey:$ep, axl_peer_id:$ed},
     judge: {pubkey:$jp, axl_peer_id:$jd}
   }' \
  > "$OUT"

echo ""
echo "Wrote $OUT:"
cat "$OUT"
