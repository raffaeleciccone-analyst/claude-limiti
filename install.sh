#!/bin/sh
# claude-limiti - one-command install for macOS and Linux, no Node.js needed beforehand.
#   curl -fsSL https://raw.githubusercontent.com/raffaeleciccone-analyst/claude-limiti/main/install.sh | sh
# With options (e.g. --codex, --force, --remove):
#   curl -fsSL https://raw.githubusercontent.com/raffaeleciccone-analyst/claude-limiti/main/install.sh | sh -s -- --codex
#
# What it does:
#  1. uses Node.js 18+ if the computer has it; otherwise downloads the official Node.js LTS from
#     nodejs.org, checks its SHA-256 and keeps only the node binary in ~/.claude/limiti-runtime
#     (private copy: no sudo, nothing installed system-wide, removed with --remove);
#  2. downloads the latest claude-limiti release from GitHub into a temporary folder;
#  3. runs its install.mjs (see the README), then deletes the temporary folder.
# The status line itself never uses the network.
set -eu

REPO=raffaeleciccone-analyst/claude-limiti
case "${LANG:-}${LC_ALL:-}" in it*|*it_*) IT=1 ;; *) IT=0 ;; esac
say() { if [ "$IT" = 1 ]; then echo "$1"; else echo "$2"; fi; }
fail() { say "Errore: $1" "Error: $2" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "serve curl" "curl is needed"
command -v tar >/dev/null 2>&1 || fail "serve tar" "tar is needed"
if command -v sha256sum >/dev/null 2>&1; then SHA="sha256sum"; else SHA="shasum -a 256"; fi

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
RUNTIME="$CLAUDE_DIR/limiti-runtime"
TMP=$(mktemp -d 2>/dev/null || mktemp -d -t claude-limiti)
trap 'rm -rf "$TMP"' EXIT INT TERM

# ---------- 1. Node ----------
NODE=""
if command -v node >/dev/null 2>&1; then
  MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
  [ "${MAJOR:-0}" -ge 18 ] 2>/dev/null && NODE=$(command -v node)
fi
[ -z "$NODE" ] && [ -x "$RUNTIME/node" ] && NODE="$RUNTIME/node"
if [ -z "$NODE" ]; then
  say "Node.js non trovato: scarico una copia privata da nodejs.org (circa 30 MB, solo per claude-limiti)..." \
      "Node.js not found: downloading a private copy from nodejs.org (about 30 MB, only for claude-limiti)..."
  case "$(uname -s)" in Darwin) OS=darwin ;; Linux) OS=linux ;; *) fail "sistema non supportato" "unsupported system" ;; esac
  case "$(uname -m)" in x86_64|amd64) ARCH=x64 ;; arm64|aarch64) ARCH=arm64 ;; *) fail "processore non supportato: $(uname -m)" "unsupported CPU: $(uname -m)" ;; esac
  # Latest LTS: the first entry of index.tab whose "lts" column is not "-"
  VER=$(curl -fsSL https://nodejs.org/dist/index.tab | awk -F'\t' 'NR>1 && $10 != "-" { print $1; exit }')
  [ -n "$VER" ] || fail "versione di Node non trovata" "Node version not found"
  NAME="node-$VER-$OS-$ARCH"
  curl -fsSL "https://nodejs.org/dist/$VER/$NAME.tar.gz" -o "$TMP/$NAME.tar.gz"
  WANT=$(curl -fsSL "https://nodejs.org/dist/$VER/SHASUMS256.txt" | awk -v f="$NAME.tar.gz" '$2 == f { print $1 }')
  GOT=$(cd "$TMP" && $SHA "$NAME.tar.gz" | awk '{ print $1 }')
  [ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || fail "controllo SHA-256 fallito" "SHA-256 check failed"
  tar -xzf "$TMP/$NAME.tar.gz" -C "$TMP"
  mkdir -p "$RUNTIME"
  cp "$TMP/$NAME/bin/node" "$RUNTIME/node"
  cp "$TMP/$NAME/LICENSE" "$RUNTIME/LICENSE-node.txt"
  chmod 755 "$RUNTIME/node"
  say "Node $VER pronto in $RUNTIME" "Node $VER ready in $RUNTIME"
  NODE="$RUNTIME/node"
fi

# ---------- 2. claude-limiti ----------
if [ -n "${LIMITI_SOURCE:-}" ]; then
  SRC="$LIMITI_SOURCE" # local copy, for testing
else
  REF=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
  if [ -n "$REF" ]; then KIND=tags; else REF=main; KIND=heads; fi
  say "Scarico claude-limiti ($REF) da GitHub..." "Downloading claude-limiti ($REF) from GitHub..."
  curl -fsSL "https://github.com/$REPO/archive/refs/$KIND/$REF.tar.gz" -o "$TMP/src.tar.gz"
  mkdir -p "$TMP/src"
  tar -xzf "$TMP/src.tar.gz" -C "$TMP/src"
  SRC=$(find "$TMP/src" -mindepth 1 -maxdepth 1 -type d | head -n 1)
fi

# ---------- 3. install ----------
"$NODE" "$SRC/install.mjs" "$@"
