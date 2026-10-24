#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for progression grid rounding
# Plants exact-string mutants, verifies they change the file and compile,
# runs targeted tests, counts new failures, restores from saved copy.

PROG_FILE="src/lib/program/progression.ts"
SAVED_FILE="/tmp/progression-saved-$$.ts"
MUTANT_COUNT=0
SURVIVED_COUNT=0

# Targeted test scripts
TESTS=(
  "npm run test:progression"
  "npm run test:progression-grid"
)

echo "=== MUTATION TESTING: progression grid rounding ==="
echo

# Save original file
cp "$PROG_FILE" "$SAVED_FILE"
echo "Saved original to $SAVED_FILE"
echo

# Run baseline tests
echo "Running baseline tests..."
BASELINE_EXIT=0
for test in "${TESTS[@]}"; do
  if ! $test > /dev/null 2>&1; then
    echo "ERROR: Baseline test failed: $test"
    echo "Baseline must pass before mutation testing"
    rm -f "$SAVED_FILE"
    exit 1
  fi
done
echo "Baseline: PASS"
echo

# Helper to test one mutant
test_mutant() {
  local name="$1"
  local find_str="$2"
  local replace_str="$3"
  
  MUTANT_COUNT=$((MUTANT_COUNT + 1))
  echo "[$MUTANT_COUNT] $name"
  
  # Restore original
  cp "$SAVED_FILE" "$PROG_FILE"
  
  # Plant mutant using exact string replacement
  if ! grep -qF "$find_str" "$PROG_FILE"; then
    echo "  ⚠️  STRING NOT FOUND (no-op mutant)"
    echo "     Looking for: $find_str"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Replace
  local tmp_file="/tmp/mutant-$$.ts"
  awk -v find="$find_str" -v replace="$replace_str" '
  {
    if (index($0, find) > 0) {
      sub(find, replace)
      changed = 1
    }
    print
  }
  END { if (!changed) exit 1 }
  ' "$PROG_FILE" > "$tmp_file"
  
  if [ $? -ne 0 ]; then
    echo "  ⚠️  REPLACEMENT FAILED"
    rm -f "$tmp_file"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  mv "$tmp_file" "$PROG_FILE"
  
  # Verify file changed
  if diff -q "$SAVED_FILE" "$PROG_FILE" > /dev/null 2>&1; then
    echo "  ⚠️  FILE UNCHANGED (no-op mutant)"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Verify it still compiles
  if ! npx --package=typescript tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  DOES NOT COMPILE"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Run targeted tests and count failures
  local has_new_failure=0
  for test in "${TESTS[@]}"; do
    if ! $test > /dev/null 2>&1; then
      has_new_failure=1
      break
    fi
  done
  
  if [ "$has_new_failure" -eq 0 ]; then
    echo "  ❌ SURVIVED (no new failures)"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
  else
    echo "  ✓ KILLED"
  fi
  
  echo
}

# Mutant R2: Success rounds down instead of up
test_mutant \
  "Success rounds down instead of up" \
  "next = roundToGrid(rawNext, equipmentIds, unit, step, 'up');" \
  "next = roundToGrid(rawNext, equipmentIds, unit, step, 'down');"

# Mutant R1: Back-off grid bypass (off-grid result)
test_mutant \
  "Back-off bypasses grid (10% reduction not snapped)" \
  "const reduced = roundToGrid(rawReduced, equipmentIds, unit, step, 'down');" \
  "const reduced = rawReduced;"

# Mutant R3: Chin-up load reset (non-loadable → 0)
test_mutant \
  "Non-loadable equipment resets load to 0" \
  "const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));" \
  "const hasLoadable = false;"

# Mutant R4: lb bells applied to kg
test_mutant \
  "lb kettlebell bells applied to kg state" \
  "const bells = unit === 'kg' ? KETTLEBELL_WEIGHTS_KG : KETTLEBELL_WEIGHTS_LB;" \
  "const bells = KETTLEBELL_WEIGHTS_LB;"

# Mutant R5: lb step applied to kg (standard grid)
test_mutant \
  "lb grid step applied to kg values" \
  "const gridStep = equipmentGridStep(effectiveEquipmentIds, unit);" \
  "const gridStep = equipmentGridStep(effectiveEquipmentIds, 'lb');"

# Mutant R6: Minimum floor → 0
test_mutant \
  "Minimum floor returns 0" \
  "return Math.max(step, rounded);" \
  "return 0;"

# Mutant R7: First miss drops two increments
test_mutant \
  "First miss drops two grid steps" \
  "const rawDrop = currentWeight - gridStep;" \
  "const rawDrop = currentWeight - gridStep * 2;"

# Mutant R8: Hard hold not snapped to grid
test_mutant \
  "Hard hold weight not snapped to grid" \
  "const held = equipmentIds && unit" \
  "const held = false && equipmentIds && unit"

# Mutant R9: suggestedWeight deload bypasses grid
test_mutant \
  "Deload suggestion bypasses grid" \
  "return roundToGrid(rawDeload, equipmentIds, unit, step, 'down');" \
  "return rawDeload;"

# Restore original
cp "$SAVED_FILE" "$PROG_FILE"
rm -f "$SAVED_FILE"

echo "==================================="
echo "Total mutants: $MUTANT_COUNT"
echo "Killed: $((MUTANT_COUNT - SURVIVED_COUNT))"
echo "Survived: $SURVIVED_COUNT"
echo

if [ "$SURVIVED_COUNT" -gt 0 ]; then
  echo "❌ MUTATION TEST FAILED: $SURVIVED_COUNT mutants survived"
  exit 1
else
  echo "✅ MUTATION TEST PASSED: All mutants killed"
  exit 0
fi
