#!/bin/bash
# Mutant test: removing rounding causes precision test to fail

set -e

PROGRESSION_FILE="src/lib/program/progression.ts"
TMP=$(mktemp -d)
BACKUP_FILE="$TMP/progression.ts"

echo "Mutant test: PB precision bug"
echo "==============================="
echo ""

# Backup original
cp "$PROGRESSION_FILE" "$BACKUP_FILE"

cleanup() {
  echo "Restoring original file..."
  cp "$BACKUP_FILE" "$PROGRESSION_FILE"
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

# Mutant 1: Remove rounding from e1rm calculation
echo "Mutant 1: Remove roundToStoragePrecision() call"
echo "Expected: test-pb-precision.ts should fail"
echo ""

sed -i 's/const e1rm = roundToStoragePrecision(estimateOneRepMax(w, v));/const e1rm = estimateOneRepMax(w, v);/' "$PROGRESSION_FILE"

if npx tsx scripts/test-pb-precision.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 1 survived (test still passes without rounding)"
  exit 1
else
  echo "✓ Mutant 1 killed (test fails without rounding)"
fi

# Restore for next mutant
cp "$BACKUP_FILE" "$PROGRESSION_FILE"

# Mutant 2: Change > to >= in comparison (should fail the boundary case)
echo ""
echo "Mutant 2: Change strict > to >= in beat function"
echo "Expected: test-pb-precision.ts should fail (boundary case)"
echo ""

sed -i 's/now !== null && before !== null && now > before/now !== null \&\& before !== null \&\& now >= before/' "$PROGRESSION_FILE"

if npx tsx scripts/test-pb-precision.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 2 survived (test still passes with >=)"
  exit 1
else
  echo "✓ Mutant 2 killed (test fails with >=)"
fi

echo ""
echo "All mutants killed ✓"
