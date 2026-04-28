#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AXL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$AXL_DIR/axl-repo"
BIN_PATH="$REPO_DIR/node"

# 1. Clone if missing
if [ ! -d "$REPO_DIR" ]; then
  echo "Cloning gensyn-ai/axl into $REPO_DIR ..."
  git clone https://github.com/gensyn-ai/axl "$REPO_DIR"
else
  echo "AXL repo already cloned at $REPO_DIR (skipping clone)"
fi

# 2. Build (Go's build cache makes re-runs cheap; the Makefile pins go1.25.5
#    via GOTOOLCHAIN, so this works even if local Go is older)
echo "Building AXL binary..."
( cd "$REPO_DIR" && make build )

# 3. Verify
if [ ! -x "$BIN_PATH" ]; then
  echo "Build finished but binary not found at: $BIN_PATH" >&2
  exit 1
fi

echo ""
echo "AXL binary built at: $BIN_PATH"
