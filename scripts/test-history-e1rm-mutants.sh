#!/bin/bash
# Mutant tests for History e1RM calculations

set -e

CALCULATIONS_FILE="src/lib/exercise-history/calculations.ts"
PROGRESSION_FILE="src/lib/program/progression.ts"
QUERIES_FILE="src/lib/exercise-history/queries.ts"
TMP=$(mktemp -d)
BACKUP_CALCULATIONS="$TMP/calculations.ts"
BACKUP_PROGRESSION="$TMP/progression.ts"
BACKUP_QUERIES="$TMP/queries.ts"

echo "Mutant tests: History e1RM consistency"
echo "======================================="
echo ""

# Backup originals
cp "$CALCULATIONS_FILE" "$BACKUP_CALCULATIONS"
cp "$PROGRESSION_FILE" "$BACKUP_PROGRESSION"
cp "$QUERIES_FILE" "$BACKUP_QUERIES"

cleanup() {
  echo "Restoring original files..."
  cp "$BACKUP_CALCULATIONS" "$CALCULATIONS_FILE"
  cp "$BACKUP_PROGRESSION" "$PROGRESSION_FILE"
  cp "$BACKUP_QUERIES" "$QUERIES_FILE"
  rm -rf "$TMP"
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

# Mutant 1: History back to 0.1 kg rounding for e1RM comparison (in getExerciseHistory)
echo "Mutant 1: History uses 0.1 kg rounding for e1RM instead of 2 dp"
echo "Expected: test-exercise-history-pr-detection.ts should fail (Case d)"
echo ""

# Change e1RM comparison to round to 0.1 kg in queries.ts
# Mutate bestE1rmInSession to round to 0.1 kg
sed -i 's/const bestE1rmInSession = Math\.max(\.\.\.weightedSetsInSession\.map(s => computeE1rm(s\.weight_kg, s\.reps) ?? 0));/const bestE1rmInSession = Math.round(Math.max(...weightedSetsInSession.map(s => computeE1rm(s.weight_kg, s.reps) ?? 0)) * 10) \/ 10;/' "$QUERIES_FILE"

if npx tsx scripts/test-exercise-history-pr-detection.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 1 survived (test still passes with 0.1 kg rounding for e1RM)"
  exit 1
else
  echo "✓ Mutant 1 killed (test fails with 0.1 kg rounding for e1RM)"
fi

# Restore for next mutant
cp "$BACKUP_CALCULATIONS" "$CALCULATIONS_FILE"

# Mutant 2: History computes w×(1+1/30) at reps=1 (removes special case)
echo ""
echo "Mutant 2: History computes w×(1+1/30) at reps=1 instead of w"
echo "Expected: test-e1rm-consistency.ts should fail"
echo ""

# Remove the reps=1 special case from estimateOneRepMax
sed -i '/if (reps === 1) return weightKg;/d' "$PROGRESSION_FILE"

if npx tsx scripts/test-e1rm-consistency.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 2 survived (test still passes without reps=1 special case)"
  exit 1
else
  echo "✓ Mutant 2 killed (test fails without reps=1 special case)"
fi

# Restore for next mutant
cp "$BACKUP_PROGRESSION" "$PROGRESSION_FILE"

# Mutant 3: >= instead of > in e1RM PR detection
echo ""
echo "Mutant 3: Change strict > to >= in e1RM PR detection"
echo "Expected: test-exercise-history-pr-detection.ts should fail"
echo ""

sed -i 's/if (bestE1rmInSession > prevE1rmValue) {/if (bestE1rmInSession >= prevE1rmValue) {/' "$QUERIES_FILE"

if npx tsx scripts/test-exercise-history-pr-detection.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 3 survived (test still passes with >= for e1RM)"
  exit 1
else
  echo "✓ Mutant 3 killed (test fails with >= for e1RM)"
fi

# Restore for next mutant
cp "$BACKUP_QUERIES" "$QUERIES_FILE"

# Mutant 4: >= instead of > in heaviest weight PR detection
echo ""
echo "Mutant 4: Change strict > to >= in heaviest weight PR detection"
echo "Expected: test-exercise-history-pr-detection.ts should fail"
echo ""

sed -i 's/if (heaviestInSession > prevHeaviestValue) {/if (heaviestInSession >= prevHeaviestValue) {/' "$QUERIES_FILE"

if npx tsx scripts/test-exercise-history-pr-detection.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 4 survived (test still passes with >= for heaviest weight)"
  exit 1
else
  echo "✓ Mutant 4 killed (test fails with >= for heaviest weight)"
fi

echo ""
echo "All History mutants killed ✓"

