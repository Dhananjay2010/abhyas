#!/usr/bin/env bash
# Mutant test for formatLoggedSets (FIX c)
#
# Mutants:
# M1: Always show per-set format (even when weight is same)
# M2: Don't skip warm-up sets
# M3: Show reps without weight for weighted exercises

set -euo pipefail

TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"; exit 130' INT TERM
trap 'CODE=$?; rm -rf "$TEMP"; exit $CODE' EXIT

SRC="src/lib/session/format-logged-sets.ts"
BACKUP="$TEMP/format-logged-sets.ts.bak"

cp "$SRC" "$BACKUP"

echo "Mutant tests for formatLoggedSets (FIX c)"
echo

# M1: Always show per-set format
echo "M1: Always show per-set format (ignore allSameWeight)"
sed -i 's/if (allSameWeight) {/if (false) {/' "$SRC"

if ! grep -q "if (false) {" "$SRC"; then
  echo "  ✗ Mutation M1 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

if npx tsx scripts/test-format-logged-sets.ts >/dev/null 2>&1; then
  echo "  ✗ M1: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M1: Test failed as expected (mutant killed)"
fi

cp "$BACKUP" "$SRC"

# M2: Don't skip warm-up sets
echo "M2: Don't skip warm-up sets"
sed -i 's/const working = sets.filter((s) => !s.isWarmupSet);/const working = sets;/' "$SRC"

if ! grep -q "const working = sets;" "$SRC"; then
  echo "  ✗ Mutation M2 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

if npx tsx scripts/test-format-logged-sets.ts >/dev/null 2>&1; then
  echo "  ✗ M2: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M2: Test failed as expected (mutant killed)"
fi

cp "$BACKUP" "$SRC"

# M3: Show reps without weight for weighted exercises
echo "M3: Show reps without weight for weighted exercises"
sed -i 's/const hasWeight = working.some/const hasWeight = false; \/\/ working.some/' "$SRC"

if ! grep -q "const hasWeight = false;" "$SRC"; then
  echo "  ✗ Mutation M3 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

if npx tsx scripts/test-format-logged-sets.ts >/dev/null 2>&1; then
  echo "  ✗ M3: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M3: Test failed as expected (mutant killed)"
fi

cp "$BACKUP" "$SRC"

echo
echo "✅ All 3 mutants killed"
