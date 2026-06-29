#!/usr/bin/env bash
# Cumbre doctor — paste output to Claude/Cowork for status check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== CUMBRE repo: structure + model + tests ==="
ls
echo "--- ml/ ---"
ls ml | head -15
if [[ -f ml/CUMBRE_fameblind_model.pkl ]]; then
  echo "  model trained OK"
else
  echo "  model NOT trained yet"
fi
python ml/test_cumbre.py 2>&1 | tail -1 || echo "  tests skipped (install ml/requirements.txt)"
git log --oneline -1 2>/dev/null || echo "  not a git repo"
git status -sb 2>/dev/null || true
