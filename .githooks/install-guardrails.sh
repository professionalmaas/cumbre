#!/bin/sh
# Arms the Cumbre safe-git guardrails. Run from the cumbre/ folder:
#   sh .githooks/install-guardrails.sh
# Re-run after a fresh clone (hooks live in .githooks/ which IS tracked, but
# git only runs hooks from .git/hooks, so we copy them in).
ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ -d "$ROOT/.git" ] || { echo "X no .git in $ROOT — run 'git init' first"; exit 1; }
hd="$ROOT/.git/hooks"
mkdir -p "$hd"
cp "$ROOT/.githooks/pre-commit" "$hd/pre-commit"
cp "$ROOT/.githooks/pre-push"   "$hd/pre-push"
chmod +x "$hd/pre-commit" "$hd/pre-push" 2>/dev/null
echo "armed Cumbre guardrails in $hd"
echo "  pre-commit: repo/branch banner · main-master block · junk guard · secret scan  (instant)"
echo "  pre-push:   main/master block · force-push block · BUILD-GREEN gate (typecheck web + steps)"
