#!/bin/sh
# ============================================================
#  SECRET SCAN  -  pre-commit (BLOCKING by default, single-pass)
#  Surfaces likely secrets in staged files in ONE grep pass (fast on
#  Windows/Git-Bash). Blocks the commit unless STRICT_SECRETS=0.
# ============================================================
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

files=$(git diff --cached --name-only --diff-filter=AM 2>/dev/null \
  | grep -Ev '\.(example|md|lock)$' \
  | grep -Ev '(package-lock\.json|\.tfvars\.example|sample|fixtures?/)')
[ -z "$files" ] && exit 0

# Pipe a NUL-delimited file list straight into xargs (no $()-capture in between,
# which would strip the NULs). grep -l output is newline-safe to capture.
hits=$(
  printf '%s\n' "$files" \
    | while IFS= read -r f; do [ -f "$root/$f" ] && printf '%s\0' "$root/$f"; done \
    | xargs -0 grep -lEi \
        'AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{20,}|(sk_live_|sk_test_|whsec_)[A-Za-z0-9]{16,}|BEGIN ([A-Z]+ )?PRIVATE KEY' \
        2>/dev/null
)

if [ -n "$hits" ]; then
  printf '\n  SECRET SCAN: possible secret(s) staged in:\n'
  printf '%s\n' "$hits" | sed "s#${root}/##; s/^/      /"
  printf '    Secrets belong in env files / Secrets Manager, not git.\n'
  if [ "$STRICT_SECRETS" = "0" ]; then
    printf '    (STRICT_SECRETS=0 -> advisory only, not blocked)\n\n'
  else
    printf '\n  X BLOCKED: commit contains what looks like a secret. Set STRICT_SECRETS=0 to override.\n\n'; exit 1
  fi
fi
exit 0
