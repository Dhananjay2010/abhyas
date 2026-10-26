#!/bin/bash
# Mutant tests for History e1RM calculations

set -euo pipefail

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

# Baseline: unmutated tests must pass
echo "Baseline: Running unmutated tests (must pass)"
if ! npx tsx scripts/test-exercise-history-pr-detection.ts > "$TMP/baseline.log" 2>&1; then
  echo "✗ BASELINE FAILED: unmutated test did not pass"
  echo "First failure:"
  grep -m 1 "FAIL\|✗" "$TMP/baseline.log" || tail -10 "$TMP/baseline.log"
  exit 1
fi
if ! npx tsx scripts/test-e1rm-consistency.ts > "$TMP/baseline2.log" 2>&1; then
  echo "✗ BASELINE FAILED: test-e1rm-consistency.ts did not pass"
  echo "First failure:"
  grep -m 1 "FAIL\|✗" "$TMP/baseline2.log" || tail -10 "$TMP/baseline2.log"
  exit 1
fi
echo "✓ Baseline passed"
echo ""

# Helper to run mutant and check exit code
run_mutant() {
  local name="$1"
  local test_script="$2"
  local logfile="$TMP/${name}.log"
  
  set +e
  npx tsx "$test_script" > "$logfile" 2>&1
  local exit_code=$?
  set -e
  
  if [ $exit_code -eq 0 ]; then
    echo "✗ FAIL: ${name} survived (test passed)"
    return 1
  else
    # Check if it was a genuine test failure (KILLED) or a crash (ERROR)
    if grep -q "FAIL\|✗" "$logfile"; then
      echo "✓ ${name} killed"
      echo "   First failure:"
      grep -m 1 "FAIL\|✗" "$logfile" | sed 's/^/   /'
      return 0
    else
      echo "✗ ERROR: ${name} crashed without test failure (exit ${exit_code})"
      echo "   Error output:"
      tail -10 "$logfile" | sed 's/^/   /'
      return 1
    fi
  fi
}

# Mutant 1: History back to 0.1 kg rounding for e1RM comparison (in getExerciseHistory)
echo "Mutant 1: History uses 0.1 kg rounding for e1RM instead of 2 dp"
echo "Expected: test-exercise-history-pr-detection.ts should fail (Case d)"
echo ""

# Change e1RM comparison to round to 0.1 kg in queries.ts
# Mutate bestE1rmInSession to round to 0.1 kg
sed -i 's/const bestE1rmInSession = Math\.max(\.\.\.weightedSetsInSession\.map(s => computeE1rm(s\.weight_kg, s\.reps) ?? 0));/const bestE1rmInSession = Math.round(Math.max(...weightedSetsInSession.map(s => computeE1rm(s.weight_kg, s.reps) ?? 0)) * 10) \/ 10;/' "$QUERIES_FILE"

if ! cmp -s "$BACKUP_QUERIES" "$QUERIES_FILE"; then
  run_mutant "Mutant 1" "scripts/test-exercise-history-pr-detection.ts" || exit 1
else
  echo "✗ Mutant 1: sed did not change queries.ts"
  exit 1
fi

# Restore for next mutant
cp "$BACKUP_QUERIES" "$QUERIES_FILE"

# Mutant 2: History computes w×(1+1/30) at reps=1 (removes special case)
echo ""
echo "Mutant 2: History computes w×(1+1/30) at reps=1 instead of w"
echo "Expected: test-e1rm-consistency.ts should fail"
echo ""

# Remove the reps=1 special case from estimateOneRepMax
sed -i '/if (reps === 1) return Math.min(weightKg, 9999.99);/d' "$PROGRESSION_FILE"

if ! cmp -s "$BACKUP_PROGRESSION" "$PROGRESSION_FILE"; then
  run_mutant "Mutant 2" "scripts/test-e1rm-consistency.ts" || exit 1
else
  echo "✗ Mutant 2: sed did not change progression.ts"
  exit 1
fi

# Restore for next mutant
cp "$BACKUP_PROGRESSION" "$PROGRESSION_FILE"

# Mutant 3: >= instead of > in e1RM PR detection
echo ""
echo "Mutant 3: Change strict > to >= in e1RM PR detection"
echo "Expected: test-exercise-history-pr-detection.ts should fail"
echo ""

sed -i 's/if (bestE1rmInSession > prevE1rmValue) {/if (bestE1rmInSession >= prevE1rmValue) {/' "$QUERIES_FILE"

if ! cmp -s "$BACKUP_QUERIES" "$QUERIES_FILE"; then
  run_mutant "Mutant 3" "scripts/test-exercise-history-pr-detection.ts" || exit 1
else
  echo "✗ Mutant 3: sed did not change queries.ts"
  exit 1
fi

# Restore for next mutant
cp "$BACKUP_QUERIES" "$QUERIES_FILE"

# Mutant 4: >= instead of > in heaviest weight PR detection
echo ""
echo "Mutant 4: Change strict > to >= in heaviest weight PR detection"
echo "Expected: test-exercise-history-pr-detection.ts should fail"
echo ""

sed -i 's/if (heaviestInSession > prevHeaviestValue) {/if (heaviestInSession >= prevHeaviestValue) {/' "$QUERIES_FILE"

if ! cmp -s "$BACKUP_QUERIES" "$QUERIES_FILE"; then
  run_mutant "Mutant 4" "scripts/test-exercise-history-pr-detection.ts" || exit 1
else
  echo "✗ Mutant 4: sed did not change queries.ts"
  exit 1
fi

# Restore for next mutant
cp "$BACKUP_QUERIES" "$QUERIES_FILE"

# Mutant 5: 0.1 kg rounding in detectPersonalRecords bestE1rm comparison
echo ""
echo "Mutant 5: detectPersonalRecords compares e1RM at 0.1 kg instead of 2 dp"
echo "Expected: test-e1rm-consistency.ts section 11 should fail (60×10 vs 60.02×10)"
echo ""

# Scoped to detectPersonalRecords only (findTopSet has identical lines)
sed -i '/^export function detectPersonalRecords/,/^}/s/const bestE1rm = computeE1rm(best\.weight_kg, best\.reps) ?? 0;/const bestE1rm = Math.round((computeE1rm(best.weight_kg, best.reps) ?? 0) * 10) \/ 10;/' "$CALCULATIONS_FILE"
sed -i '/^export function detectPersonalRecords/,/^}/s/const currentE1rm = computeE1rm(current\.weight_kg, current\.reps) ?? 0;/const currentE1rm = Math.round((computeE1rm(current.weight_kg, current.reps) ?? 0) * 10) \/ 10;/' "$CALCULATIONS_FILE"

if ! cmp -s "$BACKUP_CALCULATIONS" "$CALCULATIONS_FILE"; then
  run_mutant "Mutant 5" "scripts/test-e1rm-consistency.ts" || exit 1
else
  echo "✗ Mutant 5: sed did not change calculations.ts"
  exit 1
fi

# Restore for next mutant
cp "$BACKUP_CALCULATIONS" "$CALCULATIONS_FILE"

# Mutant 6 (QA3 C5a): getExerciseHistory compares the raw heaviest weight
echo ""
echo "Mutant 6: getExerciseHistory heaviest weight unrounded"
echo "Expected: test-exercise-history-pr-detection.ts Case (e) should fail"
echo ""
sed -i 's/Math\.max(\.\.\.weightedSetsInSession\.map(s => roundToStoragePrecision(s\.weight_kg ?? 0)))/Math.max(...weightedSetsInSession.map(s => (s.weight_kg ?? 0)))/; s/weightedSetsInSession\.find(s => roundToStoragePrecision(s\.weight_kg ?? 0) === heaviestInSession)/weightedSetsInSession.find(s => (s.weight_kg ?? 0) === heaviestInSession)/' "$QUERIES_FILE"
if ! cmp -s "$BACKUP_QUERIES" "$QUERIES_FILE"; then
  run_mutant "Mutant 6" "scripts/test-exercise-history-pr-detection.ts" || exit 1
else
  echo "✗ Mutant 6: sed did not change queries.ts"
  exit 1
fi
cp "$BACKUP_QUERIES" "$QUERIES_FILE"

# Mutant 7 (QA3 C5c): detectPersonalRecords compares raw heaviest weights
echo ""
echo "Mutant 7: detectPersonalRecords heaviest compare unrounded"
echo "Expected: test-exercise-history-pr-detection.ts Case (f) should fail"
echo ""
sed -i 's/const bestWeight = roundToStoragePrecision(best\.weight_kg ?? 0);/const bestWeight = (best.weight_kg ?? 0);/; s/const currentWeight = roundToStoragePrecision(current\.weight_kg ?? 0);/const currentWeight = (current.weight_kg ?? 0);/' "$CALCULATIONS_FILE"
if ! cmp -s "$BACKUP_CALCULATIONS" "$CALCULATIONS_FILE"; then
  run_mutant "Mutant 7" "scripts/test-exercise-history-pr-detection.ts" || exit 1
else
  echo "✗ Mutant 7: sed did not change calculations.ts"
  exit 1
fi
cp "$BACKUP_CALCULATIONS" "$CALCULATIONS_FILE"

# Mutant 8 (QA3 LOW-6): reps=1 skips the 9999.99 clamp
echo ""
echo "Mutant 8: estimateOneRepMax reps=1 without 9999.99 clamp"
echo "Expected: test-e1rm-consistency.ts section 12 should fail"
echo ""
sed -i 's/if (reps === 1) return Math\.min(weightKg, 9999\.99);/if (reps === 1) return weightKg;/' "$PROGRESSION_FILE"
if ! cmp -s "$BACKUP_PROGRESSION" "$PROGRESSION_FILE"; then
  run_mutant "Mutant 8" "scripts/test-e1rm-consistency.ts" || exit 1
else
  echo "✗ Mutant 8: sed did not change progression.ts"
  exit 1
fi
cp "$BACKUP_PROGRESSION" "$PROGRESSION_FILE"

echo ""
echo "All History mutants killed ✓"

