#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AXL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYS_DIR="$AXL_DIR/keys"

mkdir -p "$KEYS_DIR"

# macOS ships LibreSSL, which has no ed25519. Prefer Homebrew OpenSSL 3.
OPENSSL_BIN="openssl"
if [ -x "/opt/homebrew/opt/openssl@3/bin/openssl" ]; then
  OPENSSL_BIN="/opt/homebrew/opt/openssl@3/bin/openssl"
elif [ -x "/usr/local/opt/openssl@3/bin/openssl" ]; then
  OPENSSL_BIN="/usr/local/opt/openssl@3/bin/openssl"
fi

echo "Using openssl: $OPENSSL_BIN"
echo "  $($OPENSSL_BIN version)"
echo ""

generate_if_missing() {
  local label="$1"
  local out_path="$2"
  if [ -f "$out_path" ]; then
    echo "$label key already exists at $out_path (keeping; delete to regenerate)"
  else
    echo "Generating $label ed25519 key..."
    "$OPENSSL_BIN" genpkey -algorithm ed25519 -out "$out_path"
    chmod 600 "$out_path"
  fi
}

generate_if_missing "bull" "$KEYS_DIR/bull.pem"
generate_if_missing "bear" "$KEYS_DIR/bear.pem"
generate_if_missing "judge" "$KEYS_DIR/judge.pem"

echo ""
echo "Keys present:"
ls -l "$KEYS_DIR/bull.pem" "$KEYS_DIR/bear.pem" "$KEYS_DIR/judge.pem"

# Write node configs with absolute key paths for the current machine.
# These are gitignored — they vary by clone location.
echo ""
echo "Writing node configs with absolute key paths..."
cat > "$AXL_DIR/node-config-1.json" <<JSON
{
  "PrivateKeyPath": "$KEYS_DIR/bull.pem",
  "Listen": ["tls://0.0.0.0:9001"],
  "Peers": [],
  "api_port": 9002,
  "max_message_size": 16777216
}
JSON
cat > "$AXL_DIR/node-config-2.json" <<JSON
{
  "PrivateKeyPath": "$KEYS_DIR/bear.pem",
  "Listen": [],
  "Peers": ["tls://127.0.0.1:9001"],
  "api_port": 9012,
  "max_message_size": 16777216
}
JSON
cat > "$AXL_DIR/node-config-3.json" <<JSON
{
  "PrivateKeyPath": "$KEYS_DIR/judge.pem",
  "Listen": [],
  "Peers": ["tls://127.0.0.1:9001"],
  "api_port": 9022,
  "max_message_size": 16777216
}
JSON
echo "  $AXL_DIR/node-config-1.json"
echo "  $AXL_DIR/node-config-2.json"
echo "  $AXL_DIR/node-config-3.json"
