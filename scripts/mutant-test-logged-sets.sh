#!/usr/bin/env bash
set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/session/format-logged-sets.ts"
BACKUP="$TEMP/format-logged-sets.ts.bak"

cleanup() {
  [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"
  rm -rf "$TEMP"
}
trap cleanup EXIT INT TERM

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1
cp "$SRC" "$BACKUP"

echo "Mutant tests for formatLoggedSets (FIX c)"

if ! npx tsx scripts/test-format-logged-sets.ts >/dev/null 2>&1; then
  echo "✗ Baseline failed"
  exit 1
fi
echo "✓ Baseline passed"
echo

# M1
echo "M1: Always per-set"
sed -i 's/if (allSameWeight) {/if (false) {/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1)
CODE=$?
set -e
[ $CODE -eq 0 ] && echo "  ✗ M1: Survived" && exit 1
echo "  ✓ M1: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

# M2
echo "M2: Include warmup"
sed -i 's/const working = sets.filter((s) => !s.isWarmupSet);/const working = sets;/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M2: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1)
CODE=$?
set -e
[ $CODE -eq 0 ] && echo "  ✗ M2: Survived" && exit 1
echo "  ✓ M2: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

# M3
echo "M3: No weight check"
cat "$SRC" | sed 's/const hasWeight = working.some/const hasWeight = false; \/\/ working.some/' > "$SRC.tmp" && mv "$SRC.tmp" "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M3: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1)
CODE=$?
set -e
[ $CODE -eq 0 ] && echo "  ✗ M3: Survived" && exit 1
echo "  ✓ M3: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

git diff --quiet "$SRC" || { echo "✗ Not restored"; exit 1; }
echo
echo "✅ All 3 mutants killed"
