#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${BLUE}ℹ $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IM_PATH="${AGENT_IM_PATH:-$SCRIPT_DIR/../agent-im}"
MAP_CLI="$SCRIPT_DIR/dist/cli/map.js"
MAP_FIND_CLI="$SCRIPT_DIR/dist/cli/map-find.js"
MAP_CALLERS_CLI="$SCRIPT_DIR/dist/cli/map-callers.js"
MAP_REFS_CLI="$SCRIPT_DIR/dist/cli/map-refs.js"
DB_PATH="$AGENT_IM_PATH/.ai/map/map.db"
SCIP_PATH="$AGENT_IM_PATH/.ai/map/index.scip"

info "=========================================="
info "Map Test Script for agent-im"
info "=========================================="

test -d "$AGENT_IM_PATH" || { fail "agent-im project not found at: $AGENT_IM_PATH"; exit 1; }
ok "Found agent-im project at: $AGENT_IM_PATH"

if ! command -v scip-typescript >/dev/null 2>&1; then
  fail "scip-typescript is required; run ./bin/install-deps.sh first"
  exit 1
fi
ok "scip-typescript is available"

info "Building map CLI..."
npm run build >/dev/null
ok "Build completed"

info "Step 1: Building map index"
node "$MAP_CLI" "$AGENT_IM_PATH" >/tmp/map-build.log
cat /tmp/map-build.log

test -f "$DB_PATH" || { fail "Missing SQLite index at $DB_PATH"; exit 1; }
test -f "$SCIP_PATH" || { fail "Missing SCIP index at $SCIP_PATH"; exit 1; }
ok "map index artifacts created"

info "Step 1b: Checking map status"
STATUS_OUTPUT="$(node "$MAP_CLI" status --cwd "$AGENT_IM_PATH")"
echo "$STATUS_OUTPUT"
echo "$STATUS_OUTPUT" | grep -q "Fresh: yes" || { fail "map status did not report a fresh index"; exit 1; }
ok "map status reports a fresh index"

info "Step 2: Query definition for handleMessage"
QUERY_OUTPUT="$(node "$MAP_FIND_CLI" handleMessage --cwd "$AGENT_IM_PATH")"
echo "$QUERY_OUTPUT"
echo "$QUERY_OUTPUT" | grep -q "handleMessage" || { fail "handleMessage definition not found"; exit 1; }
echo "$QUERY_OUTPUT" | grep -E "(dist/|node_modules/|\.d\.ts)" && { fail "Noise found in definition query results"; exit 1; } || true
ok "Definition query returned handleMessage (no noise)"

info "Step 3: Query callers for getAgentBrand"
CALLERS_OUTPUT="$(node "$MAP_CALLERS_CLI" getAgentBrand --cwd "$AGENT_IM_PATH")"
echo "$CALLERS_OUTPUT"
echo "$CALLERS_OUTPUT" | grep -q "thread-ops.ts" || { fail "Expected getAgentBrand callers missing"; exit 1; }
echo "$CALLERS_OUTPUT" | grep -E "(dist/|node_modules/|\.d\.ts)" && { fail "Noise found in callers query results"; exit 1; } || true
ok "Callers query returned getAgentBrand usage (no noise)"

info "Step 4: Query refs for loadConfig"
REFS_OUTPUT="$(node "$MAP_REFS_CLI" loadConfig --cwd "$AGENT_IM_PATH")"
echo "$REFS_OUTPUT"
echo "$REFS_OUTPUT" | grep -q "main.ts" || { fail "Expected loadConfig reference missing"; exit 1; }
echo "$REFS_OUTPUT" | grep -E "(dist/|node_modules/|\.d\.ts)" && { fail "Noise found in refs query results"; exit 1; } || true
ok "Reference query returned loadConfig usage (no noise)"

info "Step 5: JSON output test"
JSON_OUTPUT="$(node "$MAP_FIND_CLI" loadConfig --cwd "$AGENT_IM_PATH" --json)"
echo "$JSON_OUTPUT" | head -20
JSON_PAYLOAD="$JSON_OUTPUT" node <<'NODE'
const payload = process.env.JSON_PAYLOAD ?? "";
const data = JSON.parse(payload);
if (!Array.isArray(data) || data.length === 0) {
  throw new Error("JSON output must be a non-empty array");
}
const first = data[0];
for (const key of ["file", "line", "kind"]) {
  if (!(key in first)) {
    throw new Error(`JSON output missing ${key}`);
  }
}
NODE
ok "JSON output is valid with expected schema"

info "All map checks passed"
