#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AXL_DIR="$SCRIPT_DIR/../axl-repo"

if [ ! -d "$AXL_DIR" ]; then
  echo "Cloning gensyn-ai/axl..."
  git clone https://github.com/gensyn-ai/axl "$AXL_DIR"
fi

echo "Building AXL binary..."
cd "$AXL_DIR"
make build

echo "AXL binary built at: $AXL_DIR/axl"
