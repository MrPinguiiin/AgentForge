#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export AI_CODER_PORT="${AI_CODER_PORT:-3001}"
export OPENCODE_SERVER_PORT="${OPENCODE_SERVER_PORT:-4200}"
export OPENCODE_MODEL="${OPENCODE_MODEL:-9router/cx/gpt-5.5}"
export OPENCODE_BINARY="${OPENCODE_BINARY:-opencode}"

PIDS=()

cleanup() {
  echo ""
  echo "[run-all] stopping services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  wait >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[run-all] missing required command: $1" >&2
    exit 1
  fi
}

start_service() {
  local name="$1"
  shift
  echo "[run-all] starting $name: $*"
  (
    set -euo pipefail
    "$@" 2>&1 | sed -u "s/^/[$name] /"
  ) &
  PIDS+=("$!")
}

require_command bun
require_command "$OPENCODE_BINARY"

echo "[run-all] root: $ROOT_DIR"
echo "[run-all] server: http://localhost:${AI_CODER_PORT}"
echo "[run-all] ui:     http://localhost:5173"
echo "[run-all] opencode server port: ${OPENCODE_SERVER_PORT}"
echo "[run-all] opencode model: ${OPENCODE_MODEL}"
echo ""

start_service core bun run --filter @ai-coder/core dev
start_service server bun run --filter @ai-coder/server dev
start_service ui bun run --filter @ai-coder/ui dev

echo ""
echo "[run-all] all services started. Press Ctrl+C to stop."
echo ""

wait
