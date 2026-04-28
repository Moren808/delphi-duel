#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AXL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_PATH="$AXL_DIR/axl-repo/node"
LOGS_DIR="$AXL_DIR/logs"
CONFIG_1="$AXL_DIR/node-config-1.json"
CONFIG_2="$AXL_DIR/node-config-2.json"

if [ ! -x "$BIN_PATH" ]; then
  echo "AXL binary not found at $BIN_PATH. Run: pnpm axl:build" >&2
  exit 1
fi
for cfg in "$CONFIG_1" "$CONFIG_2"; do
  if [ ! -f "$cfg" ]; then
    echo "Config not found: $cfg" >&2
    exit 1
  fi
done

mkdir -p "$LOGS_DIR"

echo "Starting AXL node 1 (bull, api_port 9002, listen tls://0.0.0.0:9001)..."
"$BIN_PATH" -config "$CONFIG_1" > "$LOGS_DIR/node-1.log" 2>&1 &
PID_1=$!
echo "$PID_1" > "$LOGS_DIR/node-1.pid"

# Give node 1 a moment to bind its listener before node 2 dials it.
sleep 1

echo "Starting AXL node 2 (bear, api_port 9012, peer to bull)..."
"$BIN_PATH" -config "$CONFIG_2" > "$LOGS_DIR/node-2.log" 2>&1 &
PID_2=$!
echo "$PID_2" > "$LOGS_DIR/node-2.pid"

echo ""
echo "Both nodes started."
echo "  Bull  PID=$PID_1  log=$LOGS_DIR/node-1.log"
echo "  Bear  PID=$PID_2  log=$LOGS_DIR/node-2.log"
echo ""
echo "To stop both: kill $PID_1 $PID_2"
echo "Or:           pnpm axl:stop"
