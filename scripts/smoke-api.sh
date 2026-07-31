#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"

echo "Running API smoke tests against ${BASE_URL}"

check_endpoint() {
  local path="$1"
  local name="$2"

  echo
  echo "[TEST] ${name} -> ${path}"

  local response
  response="$(curl -sS -w "\n%{http_code}" "${BASE_URL}${path}")"

  local body
  body="$(printf '%s' "${response}" | sed '$d')"

  local status
  status="$(printf '%s' "${response}" | tail -n1)"

  if [[ "${status}" != "200" ]]; then
    echo "[FAIL] ${name}: expected 200, got ${status}"
    echo "Response body:"
    echo "${body}"
    exit 1
  fi

  node -e "const body = JSON.parse(process.argv[1]); if (!body.ok) { throw new Error('ok is false'); }" "${body}"
  echo "[PASS] ${name}: status 200 and ok=true"
}

check_endpoint "/health" "Health"
check_endpoint "/api/players?limit=5&offset=0" "Players"
check_endpoint "/api/stats?limit=5&offset=0" "Stats"

echo

echo "All smoke tests passed."
