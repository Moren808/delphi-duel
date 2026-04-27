#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_DIR="$SCRIPT_DIR/../keys"

mkdir -p "$KEYS_DIR"

echo "Generating bull ed25519 key..."
openssl genpkey -algorithm ed25519 -out "$KEYS_DIR/bull.pem"

echo "Generating bear ed25519 key..."
openssl genpkey -algorithm ed25519 -out "$KEYS_DIR/bear.pem"

echo "Keys written to axl/keys/bull.pem and axl/keys/bear.pem (gitignored)"
