#!/bin/bash
set -euo pipefail

REPO_URL="https://github.com/CtriXin/folder-graphy"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/map}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
INSTALL_REF="${MAP_INSTALL_REF:-}"
INSTALL_CHANNEL="latest-tag"
RESOLVED_REF=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[map]${NC} $1"; }
warn() { echo -e "${YELLOW}[map]${NC} $1"; }
error() { echo -e "${RED}[map]${NC} $1"; }

usage() {
  cat <<USAGE
Usage:
  bash install.sh [--ref <tag-or-branch>]
  bash install.sh --main
  bash install.sh --latest-tag

Notes:
  - default install channel is latest semver tag
  - --ref can pin a specific version such as v0.3.1 or a branch such as main
  - MAP_INSTALL_REF can also be used to pass a pinned version via env
USAGE
}

check_deps() {
  local missing=()
  command -v git >/dev/null 2>&1 || missing+=("git")
  command -v node >/dev/null 2>&1 || missing+=("node")
  command -v npm >/dev/null 2>&1 || missing+=("npm")

  if [ ${#missing[@]} -ne 0 ]; then
    error "Missing dependencies: ${missing[*]}"
    echo "Please install: https://nodejs.org/"
    exit 1
  fi
}

resolve_latest_tag() {
  git ls-remote --tags --refs "$REPO_URL.git" \
    | awk '{print $2}' \
    | sed 's#refs/tags/##' \
    | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V \
    | tail -n 1
}

resolve_install_ref() {
  local ref="$INSTALL_REF"
  if [ -n "$ref" ]; then
    RESOLVED_REF="$ref"
    return
  fi

  if [ "$INSTALL_CHANNEL" = "latest-tag" ]; then
    ref="$(resolve_latest_tag || true)"
    if [ -n "$ref" ]; then
      RESOLVED_REF="$ref"
      return
    fi
    warn "Failed to resolve latest tag, falling back to main"
  fi

  RESOLVED_REF="main"
}

install_from_git() {
  resolve_install_ref
  info "Installing Map to $INSTALL_DIR..."
  info "Using ref: $RESOLVED_REF"

  if [ -d "$INSTALL_DIR/.git" ]; then
    warn "Directory exists, updating..."
  else
    mkdir -p "$(dirname "$INSTALL_DIR")"
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL.git" "$INSTALL_DIR"
  fi

  cd "$INSTALL_DIR"
  git fetch origin --tags --prune
  git checkout "$RESOLVED_REF"
  if [ "$RESOLVED_REF" = "main" ]; then
    git pull --ff-only origin main
  fi

  info "Installing dependencies..."
  npm install

  info "Building..."
  npm run build

  info "Creating symlinks..."
  mkdir -p "$BIN_DIR"
  for cmd in map map-find map-callers map-refs; do
    ln -sf "$INSTALL_DIR/dist/cli/$cmd.js" "$BIN_DIR/$cmd"
  done

  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    warn "Please add $BIN_DIR to your PATH:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    echo ""
    echo "Or run this command to add to your shell config:"
    echo "  echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc"
  fi
}

check_indexers() {
  echo ""
  info "Checking language indexers..."

  if command -v scip-typescript >/dev/null 2>&1; then
    info "✓ scip-typescript found (TypeScript support)"
  else
    warn "scip-typescript not found. Install for TypeScript support:"
    echo "  npm install -g @sourcegraph/scip-typescript"
  fi

  if command -v scip-go >/dev/null 2>&1; then
    info "✓ scip-go found (Go support)"
  else
    warn "scip-go not found. Install for Go support:"
    echo "  go install github.com/sourcegraph/scip-go/cmd/scip-go@latest"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      shift
      if [[ -z "${1:-}" ]]; then
        error "--ref requires a tag or branch name"
        usage
        exit 1
      fi
      INSTALL_REF="$1"
      ;;
    --main)
      INSTALL_REF="main"
      INSTALL_CHANNEL="branch"
      ;;
    --latest-tag)
      INSTALL_REF=""
      INSTALL_CHANNEL="latest-tag"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

main() {
  echo "=== Map Installer ==="
  echo ""

  check_deps
  install_from_git
  check_indexers

  echo ""
  info "Installation complete!"
  echo ""
  echo "Quick start:"
  echo "  map /path/to/project     # Build index"
  echo "  map-find SymbolName      # Find definition"
  echo "  map-callers SymbolName   # Find callers"
  echo "  map-refs SymbolName      # Find references"
  echo ""
  echo "For Claude Code integration, see:"
  echo "  $INSTALL_DIR/README.md"
}

main "$@"
