#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; }

need_scip_ts=false
need_scip_go=false

if command -v node >/dev/null 2>&1; then
  ok "node: $(command -v node)"
else
  fail "node not found"
  exit 1
fi

if command -v npm >/dev/null 2>&1; then
  ok "npm: $(command -v npm)"
else
  fail "npm not found"
  exit 1
fi

if command -v scip-typescript >/dev/null 2>&1; then
  ok "scip-typescript: $(command -v scip-typescript)"
else
  warn "scip-typescript not found"
  need_scip_ts=true
fi

if command -v go >/dev/null 2>&1; then
  if command -v scip-go >/dev/null 2>&1; then
    ok "scip-go: $(command -v scip-go)"
  else
    warn "scip-go not found"
    need_scip_go=true
  fi
else
  warn "go not found; Go project indexing will be unavailable"
fi

if [ "$need_scip_ts" = true ]; then
  echo "Installing scip-typescript via npm..."
  npm install -g @sourcegraph/scip-typescript
fi

if [ "$need_scip_go" = true ]; then
  echo "Installing scip-go via go install..."
  go install github.com/sourcegraph/scip-go/cmd/scip-go@latest
fi

if command -v scip-typescript >/dev/null 2>&1; then
  ok "scip-typescript ready"
else
  fail "scip-typescript is still missing"
  exit 1
fi

if command -v go >/dev/null 2>&1 && ! command -v scip-go >/dev/null 2>&1; then
  GOPATH_DIR="$(go env GOPATH 2>/dev/null || true)"
  if [ -n "$GOPATH_DIR" ] && [ -x "$GOPATH_DIR/bin/scip-go" ]; then
    warn "scip-go installed at $GOPATH_DIR/bin/scip-go but not in PATH"
  else
    warn "scip-go is still unavailable"
  fi
fi

ok "map dependencies checked"
