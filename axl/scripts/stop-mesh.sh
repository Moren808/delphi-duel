#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AXL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGS_DIR="$AXL_DIR/logs"

stopped=0
for pid_file in "$LOGS_DIR/node-1.pid" "$LOGS_DIR/node-2.pid" "$LOGS_DIR/node-3.pid"; do
  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file")
    if kill "$pid" 2>/dev/null; then
      echo "Stopped AXL node (pid $pid)"
      stopped=$((stopped + 1))
    else
      echo "Node pid $pid was not running"
    fi
    rm -f "$pid_file"
  fi
done

if [ $stopped -eq 0 ]; then
  echo "No AXL nodes were tracked in pidfiles."
fi

# Fallback: catch any AXL node processes not tracked by pidfiles
# (e.g. left over from an earlier run where pidfiles were lost).
if pgrep -f "axl-repo/node" > /dev/null 2>&1; then
  echo "Found untracked AXL node processes; killing them..."
  pkill -f "axl-repo/node" || true
  sleep 1
fi

if pgrep -f "axl-repo/node" > /dev/null 2>&1; then
  echo "Some AXL node processes still running; sending SIGKILL..."
  pkill -9 -f "axl-repo/node" || true
fi

echo "Done."
