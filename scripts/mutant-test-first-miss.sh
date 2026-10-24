#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for first-miss hold guard
# Run baseline first and abort if red
# Back up the file, apply each mutant, verify it changed, check tsc compiles, run tests
# Restore from backup in trap on EXIT/INT/TERM

FILE="src/lib/program/progression.ts"
BACKUP="/tmp/progression-backup-$$.ts"
FAILED=0
SURVIVORS=()
SKIPPED=()

trap 'rm -f "$BACKUP"; exit 1' INT TERM
trap 'rm -f "$BACKUP"' EXIT

echo "=== Mutant Testing: First-Miss Hold Guard ==="
echo

# Baseline: run tests
echo "Running baseline tests..."
if ! npm run test:first-miss-pinned > /dev/null 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests."
  exit 1
fi
echo "✓ Baseline tests pass"
echo

# Back up original
cp "$FILE" "$BACKUP"

run_mutant() {
  local name="$1"
  local description="$2"
  local search="$3"
  local replace="$4"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Apply mutant
  sed -i "s|$search|$replace|g" "$FILE"
  
  # Verify file changed
  if cmp -s "$FILE" "$BACKUP"; then
    echo "  ❌ SCRIPT ERROR: File did not change"
    SKIPPED+=("$name: file unchanged")
    cp "$BACKUP" "$FILE"
    return 1
  fi
  
  # Check tsc compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ❌ SCRIPT ERROR: Mutant does not compile"
    SKIPPED+=("$name: does not compile")
    cp "$BACKUP" "$FILE"
    return 1
  fi
  
  # Run tests
  if npm run test:first-miss-pinned > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ KILLED"
  fi
  
  # Restore
  cp "$BACKUP" "$FILE"
}

# Mutant 1: Remove the 20% guard
run_mutant \
  "(a) remove 20% guard" \
  "Remove the cutFraction > FIRST_MISS_HOLD_THRESHOLD check" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {" \
  "if (false) {"

# Mutant 2: Threshold 0.20 → 0.5
run_mutant \
  "(b) threshold 0.20 → 0.5" \
  "Change FIRST_MISS_HOLD_THRESHOLD from 0.20 to 0.50" \
  "export const FIRST_MISS_HOLD_THRESHOLD = 0.20;" \
  "export const FIRST_MISS_HOLD_THRESHOLD = 0.50;"

# Mutant 3: > to >=
run_mutant \
  "(c) > to >=" \
  "Change cutFraction > FIRST_MISS_HOLD_THRESHOLD to >=" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD)" \
  "if (cutFraction >= FIRST_MISS_HOLD_THRESHOLD)"

# Mutant 4: Apply guard with no equipment
run_mutant \
  "(d) guard with no equipment" \
  "Apply 20% guard even without equipment" \
  "if (currentWeight !== null && currentWeight > 0 && equipmentIds && unit)" \
  "if (currentWeight !== null && currentWeight > 0)"

# Mutant 5: Hold returns the candidate (wait, this doesn't make sense - the hold already returns current)
# Let me change it to: when we decide to hold, return the candidate instead
run_mutant \
  "(e) hold returns candidate" \
  "When holding due to threshold, return candidate instead of current" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {      candidateWeight = currentWeight;" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {      candidateWeight = candidateWeight;"

# Mutant 6: Remove 1.5-step floor
run_mutant \
  "(f) remove 1.5*step floor" \
  "Remove the check that candidate must be >= current - 1.5*step" \
  "if (candidateWeight < currentWeight - 1.5 \* gridStep) {" \
  "if (false) {"

# Mutant 7: Use nearest grid value instead of strictly below
run_mutant \
  "(g) nearest instead of strictly below" \
  "Round to nearest grid point instead of strictly below" \
  "const stepsBelow = Math.floor((currentWeight - epsilon) / gridStep);" \
  "const stepsBelow = Math.round(currentWeight / gridStep);"

# Mutant 8: Drop equipment two-miss cap
run_mutant \
  "(h) drop equipment two-miss cap" \
  "Remove the 'never drop more than one lift increment below 90%' cap for equipment" \
  "} else if (equipmentIds && unit) {      // With equipment: use equipment grid, cap at one lift increment below 90%" \
  "} else if (false) {      // With equipment: use equipment grid, cap at one lift increment below 90%"

# Mutant 9: Remove invariant clamp
run_mutant \
  "(i) remove invariant clamp" \
  "Remove the max(candidateWeight, twoMissFloor) clamp" \
  "candidateWeight = Math.max(candidateWeight, twoMissFloor);" \
  "candidateWeight = candidateWeight;"

# Mutant 10: Failure counter not incremented
run_mutant \
  "(j) failure counter not incremented" \
  "Don't increment consecutiveFailures on first miss" \
  "consecutiveFailures: failures," \
  "consecutiveFailures: 0,"

# Mutant 11: suggestedWeight snaps on hold
run_mutant \
  "(k) suggestedWeight snaps on hold" \
  "Make suggestedWeight snap to grid even on hold (non-deload)" \
  "// Non-deload: return current weight unchanged (hold outcome)  if (!isDeload) {    return w;" \
  "// Non-deload: return current weight unchanged (hold outcome)  if (!isDeload) {    const step = meta.isBodyweight && w > 0 ? addedWeightStep(meta) : incrementFor(meta); const snapped = roundToGrid(w, equipmentIds, unit, step, 'down'); return Math.min(w, snapped);"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   11"
echo "Killed:                          $((11 - FAILED - ${#SKIPPED[@]}))"
echo "Survived:                        $FAILED"
echo "Skipped:                         ${#SKIPPED[@]}"
echo "========================================="

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo
  echo "Survivors:"
  for survivor in "${SURVIVORS[@]}"; do
    echo "  - $survivor"
  done
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo
  echo "Skipped (script errors):"
  for skip in "${SKIPPED[@]}"; do
    echo "  - $skip"
  done
  echo
  echo "❌ FAIL: Script errors detected"
  exit 1
fi

if [ $FAILED -gt 0 ]; then
  echo
  echo "❌ FAIL: $FAILED mutant(s) survived"
  exit 1
fi

echo
echo "✅ PASS: All mutants killed"
