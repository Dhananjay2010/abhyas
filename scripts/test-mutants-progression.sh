#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for progression grid rounding
# Uses literal string replacement (grep -F), verifies each mutant changes the file,
# restores from backup on ANY exit, targeted tests only.

PROG_FILE="src/lib/program/progression.ts"
BACKUP_FILE="/tmp/progression-backup-$$.ts"
MUTANT_COUNT=0
SURVIVED_COUNT=0

# Targeted test scripts (green baseline required)
TESTS=(
  "npm run test:progression"
  "npm run test:progression-grid"
)

echo "=== MUTATION TESTING: progression grid rounding ==="
echo

# Save backup
cp "$PROG_FILE" "$BACKUP_FILE"
echo "Saved backup to $BACKUP_FILE"
echo

# Restore on ANY exit
trap 'cp "$BACKUP_FILE" "$PROG_FILE" 2>/dev/null; rm -f "$BACKUP_FILE"' EXIT

# Check baseline
echo "Running baseline tests..."
for test in "${TESTS[@]}"; do
  if ! $test > /dev/null 2>&1; then
    echo "ERROR: Baseline test failed: $test"
    echo "Baseline must be green before mutation testing"
    exit 1
  fi
done
echo "Baseline: all tests pass"
echo

# Helper to test one mutant
test_mutant() {
  local name="$1"
  local find_str="$2"
  local replace_str="$3"
  
  MUTANT_COUNT=$((MUTANT_COUNT + 1))
  echo "[$MUTANT_COUNT] $name"
  
  # Restore original
  cp "$BACKUP_FILE" "$PROG_FILE"
  
  # Check string exists (literal match)
  if ! grep -qF "$find_str" "$PROG_FILE"; then
    echo "  ⚠️  STRING NOT FOUND (no-op mutant)"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Plant mutant using Python for literal replacement
  python3 -c "
import sys
with open('$PROG_FILE', 'r') as f:
    content = f.read()
original = content
content = content.replace('''$find_str''', '''$replace_str''', 1)
with open('$PROG_FILE', 'w') as f:
    f.write(content)
sys.exit(0 if content != original else 1)
" 2>/dev/null
  
  if [ $? -ne 0 ]; then
    echo "  ⚠️  REPLACEMENT FAILED"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Verify file changed
  if diff -q "$BACKUP_FILE" "$PROG_FILE" > /dev/null 2>&1; then
    echo "  ⚠️  FILE UNCHANGED"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Verify still compiles
  if ! npx --package=typescript tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  DOES NOT COMPILE"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Run targeted tests
  local has_new_failure=0
  for test in "${TESTS[@]}"; do
    if ! $test > /dev/null 2>&1; then
      has_new_failure=1
      break
    fi
  done
  
  if [ "$has_new_failure" -eq 0 ]; then
    echo "  ❌ SURVIVED"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
  else
    echo "  ✅ KILLED"
  fi
  
  echo
}

# PR1: Success rounds down
test_mutant \
  "Success rounds down (not up)" \
  "next = roundToGrid(rawNext, equipmentIds, unit, step, 'up');" \
  "next = roundToGrid(rawNext, equipmentIds, unit, step, 'down');"

# PR2: Back-off bypasses grid
test_mutant \
  "Back-off bypasses grid" \
  "const reduced = roundToGrid(rawReduced, equipmentIds, unit, step, 'down');" \
  "const reduced = rawReduced;"

# PR3: Non-loadable equipment resets to 0
test_mutant \
  "Non-loadable equipment → 0" \
  "const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));" \
  "const hasLoadable = false;"

# PR4: lb bells on kg state
test_mutant \
  "lb kettlebell bells on kg state" \
  "const bells = KETTLEBELL_WEIGHTS_KG;" \
  "const bells = KETTLEBELL_WEIGHTS_LB;"

# PR5: lb grid step on kg
test_mutant \
  "lb grid step on kg values" \
  "const gridStep = equipmentGridStep(effectiveEquipmentIds, 'kg');" \
  "const gridStep = equipmentGridStep(effectiveEquipmentIds, 'lb');"

# PR6: No-equipment minimum floor → 0
test_mutant \
  "No-equipment minimum floor → 0" \
  "return Math.max(step, rounded);" \
  "return 0;"

# PR7: First miss drops two steps
test_mutant \
  "First miss drops two grid steps" \
  "const rawDrop = currentWeight - gridStep;" \
  "const rawDrop = currentWeight - gridStep * 2;"

# PR8: Hard hold weight check disabled
test_mutant \
  "Hard hold condition disabled" \
  "if (feel === \"hard\" && currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {" \
  "if (feel === \"easy\" && currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {"

# PR9: Deload bypasses grid
test_mutant \
  "Deload suggestion bypasses grid" \
  "return roundToGrid(rawDeload, equipmentIds, unit, step, 'down');" \
  "return rawDeload;"

# N1: No-equipment first miss floor removed (allows negatives)
test_mutant \
  "No-equipment first miss allows negatives" \
  "let nextWeight = currentWeight;" \
  "let nextWeight = currentWeight !== null && currentWeight > 0 ? currentWeight - incrementFor(meta) : currentWeight;"

# N2: No-equipment first miss drops (code change, not comment)
test_mutant \
  "No-equipment first miss drops (main holds)" \
  "  // First miss: drop one equipment grid step with equipment, hold without
  let nextWeight = currentWeight;
  if (currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {" \
  "  // First miss: drop one equipment grid step with equipment, drop without
  let nextWeight = currentWeight !== null && currentWeight > 0 ? currentWeight - incrementFor(meta) : currentWeight;
  if (currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {"

# N6: noData snap removed
test_mutant \
  "noData snap removed" \
  "noDataWeight = snapped > noDataWeight ? noDataWeight : snapped;" \
  "noDataWeight = noDataWeight;"

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
