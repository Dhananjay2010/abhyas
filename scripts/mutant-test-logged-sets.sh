#!/usr/bin/env bash
# Mutant test for formatLoggedSets (FIX c)

set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/session/format-logged-sets.ts"
BACKUP="$TEMP/format-logged-sets.ts.bak"

cleanup() {
  CODE=$?
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$SRC"
  fi
  rm -rf "$TEMP"
  exit $CODE
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
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M1: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M1: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M1: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

# M2
echo "M2: Include warmup"
sed -i 's/const working = sets.filter((s) => !s.isWarmupSet);/const working = sets;/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M2: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M2: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M2: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

# M3
echo "M3: No weight check"
sed -i 's/const hasWeight = working.some/const hasWeight = false; \/\/ working.some/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M3: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-format-logged-sets.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M3: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M3: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

if ! git diff --quiet "$SRC"; then
  echo "✗ Not restored"
  exit 1
fi
echo
echo "✅ All 3 mutants killed"
