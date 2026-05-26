#!/usr/bin/env bash
# Scan tracked files and git history for common secret patterns.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PATTERNS=(
  'ghp_[a-zA-Z0-9]{36,}'
  'github_pat_[a-zA-Z0-9_]{20,}'
  'sk-[a-zA-Z0-9]{20,}'
  'AKIA[0-9A-Z]{16}'
  'xox[baprs]-[a-zA-Z0-9-]{10,}'
  'BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY'
)

echo "== Tracked files =="
FOUND=0
for p in "${PATTERNS[@]}"; do
  if git grep -E "$p" -- . 2>/dev/null; then
    echo "FAIL: pattern matched in working tree: $p"
    FOUND=1
  fi
done

echo "== Git history (all commits) =="
for p in "${PATTERNS[@]}"; do
  if git log -p --all -E -- "$p" -- . 2>/dev/null | head -1 | grep -q .; then
    echo "FAIL: pattern found in history: $p"
    FOUND=1
  fi
done

echo "== Forbidden paths in index =="
FORBIDDEN='\.env$|\.pem$|\.key$|id_rsa|credentials\.json|\.npmrc$'
if git ls-files | grep -E "$FORBIDDEN"; then
  echo "FAIL: sensitive paths are tracked"
  FOUND=1
fi

if [[ "$FOUND" -eq 0 ]]; then
  echo "OK: no common secret patterns detected"
  exit 0
fi
exit 1
