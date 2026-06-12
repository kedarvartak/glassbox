#!/usr/bin/env bash
set -euo pipefail

# Glassbox installer
# Clones (or reuses the current checkout), builds, and puts `glassbox` on PATH.
# Requires Node >= 22. pnpm is activated via corepack (bundled with Node).

REPO="https://github.com/kedarvartak/glassbox.git"
INSTALL_DIR="${GLASSBOX_DIR:-$HOME/.glassbox-cli}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

bold()  { printf '\033[1m%s\033[0m' "$*"; }
green() { printf '\033[32m%s\033[0m' "$*"; }
red()   { printf '\033[31m%s\033[0m' "$*"; }
dim()   { printf '\033[2m%s\033[0m' "$*"; }

echo ""
echo "  $(bold 'Glassbox') — x-ray & hygiene monitor for AI agent context"
echo "  $(dim 'https://github.com/kedarvartak/glassbox')"
echo ""

# ── Node version check ────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  $(red '✗') Node.js not found. Install Node 22+ from https://nodejs.org and re-run."
  exit 1
fi

NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "  $(red '✗') Node $NODE_MAJOR detected. Glassbox requires Node 22+."
  echo "     Current version: $(node --version)"
  exit 1
fi
echo "  $(green '✓') Node $(node --version)"

# ── pnpm via corepack ─────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  echo "  Activating pnpm via corepack..."
  corepack enable pnpm 2>/dev/null || {
    echo "  $(red '✗') corepack failed. Try: npm install -g pnpm"
    exit 1
  }
fi
echo "  $(green '✓') pnpm $(pnpm --version)"

# ── Clone or update ───────────────────────────────────────────────────────────
# If we're already inside the repo (dev / local demo), build in place.
if [ -f "$(pwd)/packages/cli/package.json" ] && [ -f "$(pwd)/pnpm-workspace.yaml" ]; then
  INSTALL_DIR="$(pwd)"
  echo "  $(dim 'Using current directory:') $INSTALL_DIR"
elif [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Updating existing clone at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only --quiet
else
  echo "  Cloning into $INSTALL_DIR..."
  git clone --depth 1 --quiet "$REPO" "$INSTALL_DIR"
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo ""
echo "  Installing dependencies..."
pnpm --dir "$INSTALL_DIR" install --frozen-lockfile --silent

echo "  Building..."
pnpm --dir "$INSTALL_DIR" build --silent 2>/dev/null || pnpm --dir "$INSTALL_DIR" build

ENTRY="$INSTALL_DIR/packages/cli/dist/main.js"
if [ ! -f "$ENTRY" ]; then
  echo "  $(red '✗') Build failed — $ENTRY not found."
  exit 1
fi
echo "  $(green '✓') Build complete"

# ── Install wrapper ───────────────────────────────────────────────────────────
mkdir -p "$BIN_DIR"
WRAPPER="$BIN_DIR/glassbox"
printf '#!/usr/bin/env bash\nexec node "%s" "$@"\n' "$ENTRY" > "$WRAPPER"
chmod +x "$WRAPPER"
echo "  $(green '✓') Installed to $WRAPPER"

# ── PATH hint ─────────────────────────────────────────────────────────────────
echo ""
if command -v glassbox &>/dev/null; then
  echo "  $(green '✓ glassbox is ready!')"
else
  echo "  $(bold 'One more step:') add $BIN_DIR to your PATH if it is not already there."
  echo ""
  echo "     For bash:   echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
  echo "     For zsh:    echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc  && source ~/.zshrc"
  echo ""
  echo "  Then run: $(bold 'glassbox')"
  echo ""
  echo "  Or run without adding to PATH:"
  echo "     $(dim "node $ENTRY")"
fi

echo ""
echo "  $(bold 'Quick start:')"
echo "     $(bold 'glassbox list')                      # find your Claude Code sessions"
echo "     $(bold 'glassbox inspect') <session.jsonl>   # x-ray, cost, reclaimable"
echo "     $(bold 'glassbox clean')   <session.jsonl>   # dry-run eviction plan"
echo "     $(bold 'glassbox clean')   <session.jsonl> $(dim '--fork')  # write a cleaned session"
echo "     $(bold 'glassbox serve')                     # open the web dashboard"
echo ""
