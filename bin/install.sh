#!/bin/bash
# Map - Lightweight code indexing tool installer
set -euo pipefail

REPO_URL="https://github.com/CtriXin/folder-graphy"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/map}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[map]${NC} $1"; }
warn() { echo -e "${YELLOW}[map]${NC} $1"; }
error() { echo -e "${RED}[map]${NC} $1"; }

# Check dependencies
check_deps() {
  local missing=()
  command -v git &>/dev/null || missing+=("git")
  command -v node &>/dev/null || missing+=("node")
  command -v npm &>/dev/null || missing+=("npm")

  if [ ${#missing[@]} -ne 0 ]; then
    error "Missing dependencies: ${missing[*]}"
    echo "Please install: https://nodejs.org/"
    exit 1
  fi
}

# Install from git
install_from_git() {
  info "Installing Map to $INSTALL_DIR..."

  if [ -d "$INSTALL_DIR" ]; then
    warn "Directory exists, updating..."
    cd "$INSTALL_DIR"
    git pull origin main
  else
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone "$REPO_URL.git" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
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

  # Add to PATH if needed
  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    warn "Please add $BIN_DIR to your PATH:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    echo ""
    echo "Or run this command to add to your shell config:"
    echo "  echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc"
  fi
}

# Check for scip-typescript / scip-go
check_indexers() {
  echo ""
  info "Checking language indexers..."

  if command -v scip-typescript &>/dev/null; then
    info "✓ scip-typescript found (TypeScript support)"
  else
    warn "scip-typescript not found. Install for TypeScript support:"
    echo "  npm install -g @sourcegraph/scip-typescript"
  fi

  if command -v scip-go &>/dev/null; then
    info "✓ scip-go found (Go support)"
  else
    warn "scip-go not found. Install for Go support:"
    echo "  go install github.com/sourcegraph/scip-go/cmd/scip-go@latest"
  fi
}

# Main
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
