#!/usr/bin/env bash
# Capture both peers' identities into axl/keys/public-keys.json.
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

mkdir -p "$KEYS_DIR"

for api in "$BULL_API" "$BEAR_API"; do
  if ! curl -sf "$api/topology" > /dev/null; then
    echo "ERROR: cannot reach $api/topology — is the mesh running? (pnpm axl:start)" >&2
    exit 1
  fi
done

echo "Waiting 5s for Yggdrasil mesh to settle..."
sleep 5

BULL_PK=$(curl -s "$BULL_API/topology" | jq -r .our_public_key)
BEAR_PK=$(curl -s "$BEAR_API/topology" | jq -r .our_public_key)

echo "Bull pubkey: $BULL_PK"
echo "Bear pubkey: $BEAR_PK"

# Drain any stale messages on both /recv queues so we don't read garbage.
drain() {
  local api="$1"
  for _ in $(seq 1 50); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$api/recv")
    [ "$code" = "204" ] && break
  done
}
drain "$BULL_API"
drain "$BEAR_API"

# Probe bull → bear, then read X-From-Peer-Id off bear's /recv → bull's axl_peer_id
curl -sf -X POST -H "X-Destination-Peer-Id: $BEAR_PK" --data-binary "probe-bull" "$BULL_API/send" > /dev/null
sleep 1
BULL_DERIVED=$(curl -s -D - -o /dev/null "$BEAR_API/recv" | awk -F': ' 'BEGIN{IGNORECASE=1} /^X-From-Peer-Id/ {print $2}' | tr -d '\r\n')

# Probe bear → bull
curl -sf -X POST -H "X-Destination-Peer-Id: $BULL_PK" --data-binary "probe-bear" "$BEAR_API/send" > /dev/null
sleep 1
BEAR_DERIVED=$(curl -s -D - -o /dev/null "$BULL_API/recv" | awk -F': ' 'BEGIN{IGNORECASE=1} /^X-From-Peer-Id/ {print $2}' | tr -d '\r\n')

if [ -z "$BULL_DERIVED" ] || [ -z "$BEAR_DERIVED" ]; then
  echo "ERROR: failed to capture one or both axl_peer_id values" >&2
  echo "  bull_derived=$BULL_DERIVED" >&2
  echo "  bear_derived=$BEAR_DERIVED" >&2
  exit 1
fi

jq -n \
  --arg bp "$BULL_PK" --arg bd "$BULL_DERIVED" \
  --arg ep "$BEAR_PK" --arg ed "$BEAR_DERIVED" \
  '{bull:{pubkey:$bp, axl_peer_id:$bd}, bear:{pubkey:$ep, axl_peer_id:$ed}}' \
  > "$OUT"

echo ""
echo "Wrote $OUT:"
cat "$OUT"
