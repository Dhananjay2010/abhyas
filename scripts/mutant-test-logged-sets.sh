#!/usr/bin/env bash
# Mutant test for formatLoggedSets (FIX c)

set -euo pipefail

TEMP=$(mktemp -d)
trap 'CODE=$?; [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"; rm -rf "$TEMP"; exit $CODE' EXIT
trap '[ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"; rm -rf "$TEMP"; exit 130' INT TERM

SRC="src/lib/session/format-logged-sets.ts"
BACKUP="$TEMP/format-logged-sets.ts.bak"

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1

cp "$SRC" "$BACKUP"

echo "Mutant tests for formatLoggedSets (FIX c)"

npx tsx scripts/test-format-logged-sets.ts >/dev/null 2>&1 || { echo "✗ Baseline failed"; exit 1; }
echo "✓ Baseline passed"
echo

echo "M1: Always per-set"
sed -i 's/if (allSameWeight) {/if (false) {/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1 || true)
echo "$OUT" | grep -q "✗" && echo "  ✓ M1: Killed" && echo "     $(echo "$OUT" | grep "✗" | head -1)" || { echo "  ✗ M1: Survived"; cp "$BACKUP" "$SRC"; exit 1; }
cp "$BACKUP" "$SRC"

echo "M2: Don't skip warmup"
sed -i 's/const working = sets.filter((s) => !s.isWarmupSet);/const working = sets;/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M2: No change" && exit 1
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1 || true)
echo "$OUT" | grep -q "✗" && echo "  ✓ M2: Killed" && echo "     $(echo "$OUT" | grep "✗" | head -1)" || { echo "  ✗ M2: Survived"; cp "$BACKUP" "$SRC"; exit 1; }
cp "$BACKUP" "$SRC"

echo "M3: No weight check"
sed -i 's/const hasWeight = working.some/const hasWeight = false; \/\/ working.some/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M3: No change" && exit 1
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1 || true)
echo "$OUT" | grep -q "✗" && echo "  ✓ M3: Killed" && echo "     $(echo "$OUT" | grep "✗" | head -1)" || { echo "  ✗ M3: Survived"; cp "$BACKUP" "$SRC"; exit 1; }
cp "$BACKUP" "$SRC"

git diff --quiet "$SRC" || { echo "✗ Not restored"; exit 1; }
echo
echo "✅ All 3 mutants killed"
