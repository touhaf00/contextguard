#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${1:-../contextguard-share-$(date +%Y%m%d-%H%M%S).zip}"
command -v zip >/dev/null || { echo "zip is required" >&2; exit 1; }
command -v unzip >/dev/null || { echo "unzip is required" >&2; exit 1; }

rm -f "$OUT"
zip -r -q "$OUT" . \
  -x '.env' '.env.*' '*/.env' '*/.env.*' \
  -x '.git/*' '.idea/*' 'node_modules/*' 'dist/*' \
  -x '.contextguard-data/*' '*.log' '*.zip' '.DS_Store' '__MACOSX/*'

zip -q "$OUT" .env.example

echo "Scanning $OUT for secrets..."
PATTERN='(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
if unzip -p "$OUT" 2>/dev/null | grep -aE "$PATTERN" >/dev/null; then
  rm -f "$OUT"
  echo "ABORTED: a secret-like value was found. The ZIP was deleted." >&2
  echo "Find it with:  grep -rEn '$PATTERN' . --exclude-dir=node_modules --exclude-dir=.git" >&2
  exit 1
fi
if unzip -l "$OUT" | awk '{print $4}' | grep -E '(^|/)\.env(\.local)?$' >/dev/null; then
  rm -f "$OUT"
  echo "ABORTED: an environment file was included. The ZIP was deleted." >&2
  exit 1
fi
echo "OK: $OUT (no env files, no secret-like values)"
