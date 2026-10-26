#!/usr/bin/env bash
# Mutant test for PB toast e1RM formatting (coordinator addition)
#
# Mutant: Restore whole-kg rounding (Math.round) instead of formatWeight

set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/program/progression.ts"
BACKUP="$TEMP/progression.ts.bak"

cleanup() {
  [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"
  rm -rf "$TEMP"
}
trap cleanup EXIT INT TERM

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1
cp "$SRC" "$BACKUP"

echo "Mutant test for PB toast e1RM formatting"

if ! npx tsx scripts/test-pb-toast-format.ts >/dev/null 2>&1; then
  echo "✗ Baseline failed"
  exit 1
fi
echo "✓ Baseline passed"
echo

# M1: Restore whole-kg rounding for e1rm
echo "M1: Restore whole-kg rounding (Math.round)"
sed -i 's/return `Best estimated one-rep max yet — \${formatWeight(pb.value, units)}`;/return `Best estimated one-rep max yet — \${Math.round(pb.value)} kg`;/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-pb-toast-format.ts 2>&1)
CODE=$?
set -e
[ $CODE -eq 0 ] && echo "  ✗ M1: Survived" && exit 1
echo "  ✓ M1: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

git diff --quiet "$SRC" || { echo "✗ Not restored"; exit 1; }
echo
echo "✅ Mutant killed"
