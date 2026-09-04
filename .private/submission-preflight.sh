#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STRICT="${STRICT:-0}"
failures=0
pending=0

pass() {
  printf 'PASS  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1"
  failures=$((failures + 1))
}

pending() {
  printf 'WAIT  %s\n' "$1"
  pending=$((pending + 1))
}

run_local() {
  local label="$1"
  shift
  if "$@"; then
    pass "$label"
  else
    fail "$label"
  fi
}

check_required_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    pass "required file: $file"
  else
    fail "required file missing: $file"
  fi
}

check_url() {
  local label="$1"
  local url="$2"
  if ! command -v curl >/dev/null 2>&1; then
    fail "$label (curl is unavailable)"
    return
  fi
  if curl -fsSL --max-time 15 -o /dev/null "$url"; then
    pass "$label"
  else
    fail "$label"
  fi
}

printf '%s\n' 'Pixel Art Tutor submission preflight'
printf '%s\n' "root: $ROOT_DIR"
printf '%s\n' "strict: $STRICT"
printf '\n%s\n' 'Local repository checks'

check_required_file LICENSE
check_required_file README.md
if rg -q 'registerTool' src/webmcp/registerTools.ts; then
  pass 'imperative WebMCP registration source present'
else
  fail 'imperative WebMCP registration source missing'
fi

if git grep -q -I -E 'CF-Access|Client-Secret|API[_-]?Key|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY' -- ':!package-lock.json'; then
  fail 'credential pattern found in tracked files'
else
  pass 'no known credential pattern in tracked files'
fi

run_local 'lint' npm run lint
run_local 'typecheck' npm run typecheck
run_local 'production build' npm run build
run_local 'patch hygiene' git diff --check

printf '\n%s\n' 'External submission checks'

check_external_url() {
  local label="$1"
  local variable="$2"
  local value="${!variable:-}"
  if [[ -z "$value" ]]; then
    pending "$label ($variable is not set)"
  else
    check_url "$label" "$value"
  fi
}

check_external_url 'live application URL' LIVE_URL
check_external_url 'public repository URL' PUBLIC_REPO_URL
check_external_url 'public YouTube URL' YOUTUBE_URL

if [[ "${ROOM_ALLOWED_ORIGIN:-}" == "" ]]; then
  pending 'production ROOM_ALLOWED_ORIGIN is not set'
else
  pass 'production ROOM_ALLOWED_ORIGIN is supplied'
fi

if [[ "${CREDENTIAL_ROTATED:-0}" == '1' ]]; then
  pass 'deployment credential rotation confirmed by operator'
else
  pending 'deployment credential rotation confirmation is not set'
fi

if [[ "${DEVPOST_SUBMITTED:-0}" == '1' ]]; then
  pass 'Devpost submission marked submitted by operator'
else
  pending 'Devpost submission is not confirmed'
fi

if [[ "$STRICT" == '1' && "$pending" -gt 0 ]]; then
  failures=$((failures + pending))
fi

printf '\nSummary: %s failure(s), %s pending external check(s)\n' "$failures" "$pending"
if [[ "$failures" -gt 0 ]]; then
  exit 1
fi
