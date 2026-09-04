#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'USAGE'
Usage: ./start.sh [--solo]

Starts the local PartyServer room worker and the Vite editor together.

Options:
  --solo    Start only Vite without room synchronization.

Environment:
  VITE_PARTYKIT_HOST  Override the PartyKit room worker URL used by Vite.
  VITE_PARTY_HOST     Legacy alias for VITE_PARTYKIT_HOST.
  VITE_HOST        Override the Vite bind host (default: 127.0.0.1).
USAGE
}

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
  --solo)
    exec npm run dev -- --host "${VITE_HOST:-127.0.0.1}"
    ;;
  "")
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

PARTYKIT_HOST="${VITE_PARTYKIT_HOST:-${VITE_PARTY_HOST:-http://127.0.0.1:1999}}"
VITE_BIND_HOST="${VITE_HOST:-127.0.0.1}"
room_pid=""
vite_pid=""

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "$vite_pid" ]] && kill -0 "$vite_pid" 2>/dev/null; then
    kill "$vite_pid" 2>/dev/null || true
  fi
  if [[ -n "$room_pid" ]] && kill -0 "$room_pid" 2>/dev/null; then
    kill "$room_pid" 2>/dev/null || true
  fi
  wait "$vite_pid" 2>/dev/null || true
  wait "$room_pid" 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

printf '%s\n' "Starting Pixel Art Tutor with room sync"
printf '%s\n' "  editor: http://${VITE_BIND_HOST}:3000"
printf '%s\n' "  room:   ${PARTYKIT_HOST}"
printf '%s\n' 'Press Ctrl-C to stop both processes.'

if [[ -z "${VITE_PARTYKIT_HOST:-}" && -z "${VITE_PARTY_HOST:-}" ]]; then
  npm run room:dev &
  room_pid=$!
else
  printf '%s\n' '  room:   using configured PartyKit host; local room worker not started'
fi

VITE_PARTYKIT_HOST="$PARTYKIT_HOST" npm run dev -- --host "$VITE_BIND_HOST" &
vite_pid=$!

wait "$vite_pid"
