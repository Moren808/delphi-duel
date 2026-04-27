#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AXL_BIN="$SCRIPT_DIR/../axl-repo/axl"
AXL_DIR="$SCRIPT_DIR/.."

if [ ! -f "$AXL_BIN" ]; then
  echo "AXL binary not found. Run: pnpm axl:build"
  exit 1
fi

echo "Starting AXL node 1 (bull, port 9002)..."
"$AXL_BIN" --config "$AXL_DIR/node-config-1.json" > /tmp/axl-node1.log 2>&1 &
echo $! > /tmp/axl-node1.pid

sleep 1

echo "Starting AXL node 2 (bear, port 9012)..."
"$AXL_BIN" --config "$AXL_DIR/node-config-2.json" > /tmp/axl-node2.log 2>&1 &
echo $! > /tmp/axl-node2.pid

echo "Both nodes started. Logs: /tmp/axl-node1.log and /tmp/axl-node2.log"
echo "PIDs stored in /tmp/axl-node1.pid and /tmp/axl-node2.pid"
echo ""
echo "To stop: kill \$(cat /tmp/axl-node1.pid) \$(cat /tmp/axl-node2.pid)"
