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
    echo
    echo "==================================="
    echo "Total mutants: $MUTANT_COUNT"
    echo "STRING NOT FOUND ERROR in mutant: $name"
    echo
    echo "❌ MUTATION TEST FAILED: string not found"
    exit 1
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

# PR2: Non-loadable equipment resets to 0
test_mutant \
  "Non-loadable equipment → 0" \
  "const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));" \
  "const hasLoadable = false;"

# PR3: lb grid step on roundToGrid
test_mutant \
  "lb grid step in roundToGrid" \
  "const gridStep = equipmentGridStep(effectiveEquipmentIds, 'kg');" \
  "const gridStep = equipmentGridStep(effectiveEquipmentIds, 'lb');"

# M1: lb grid step in first miss
test_mutant \
  "lb grid step in first miss" \
  "      const gridStep = equipmentGridStep(equipmentIds, 'kg');" \
  "      const gridStep = equipmentGridStep(equipmentIds, 'lb');"

# PR5: No-equipment minimum floor → 0
test_mutant \
  "No-equipment minimum floor → 0" \
  "return Math.max(step, rounded);" \
  "return 0;"

# PR6: First miss drops two steps
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
  "  const snapped = roundToGrid(rawDeload, equipmentIds, unit, step, 'down');" \
  "  const snapped = rawDeload;"

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

# M3: Success can decrease weight
test_mutant \
  "Success can decrease weight" \
  "    // Never decrease weight on success (can happen at max bell or with off-grid stored weights)
    if (next <= from) {" \
  "    // Allow weight to decrease on success
    if (false && next <= from) {"

# I4b: Hard hold snaps down
test_mutant \
  "Hard hold snaps down" \
  "      return {
        ...carried,
        outcome: \"hold\",
        nextWorkingWeightKg: currentWeight," \
  "      const snapped = roundToGrid(currentWeight, equipmentIds, unit, incrementFor(meta), 'down');
      return {
        ...carried,
        outcome: \"hold\",
        nextWorkingWeightKg: snapped,"

# I4c: Suggestion can raise weight
test_mutant \
  "Suggestion can raise weight" \
  "      return Math.min(w, snapped);" \
  "      return snapped;"

# I2a: Back-off uses lift increment for rounding (not 2.5 kg grid)
test_mutant \
  "Back-off uses lift increment for rounding" \
  "    const roundingGrid = meta.mechanic === \"isolation\" ? 1.25 : 2.5;" \
  "    const roundingGrid = incrementFor(meta);"

# I3a: First miss can raise weight (no check)
test_mutant \
  "First miss can raise weight on standard equipment" \
  "      // Never raise on miss
      nextWeight = candidate < currentWeight ? candidate : currentWeight;" \
  "      // Allow raising
      nextWeight = candidate;"

# I3b: First miss kettlebell can raise weight
test_mutant \
  "First miss can raise weight on kettlebell" \
  "        // Never raise on miss
        nextWeight = candidate < currentWeight ? candidate : currentWeight;" \
  "        // Allow raising
        nextWeight = candidate;"

# K1: Kettlebell back-off drops two bells
test_mutant \
  "Kettlebell back-off drops two bells" \
  "        targetIndex = Math.max(0, currentIndex - 1);" \
  "        targetIndex = Math.max(0, currentIndex - 2);"

# K3: Back-off hold check disabled (reduced <= step)
test_mutant \
  "Back-off hold check disabled" \
  "    // HOLD if the computed weight is at or below the minimum step
    if (reduced <= liftIncrement) {" \
  "    // Hold check disabled
    if (false && reduced <= liftIncrement) {"

# K4: Isolation back-off uses 2.5 kg grid (not 1.25 kg)
test_mutant \
  "Isolation back-off uses 2.5 kg grid" \
  "      const roundingGrid = meta.mechanic === \"isolation\" ? 1.25 : 2.5;" \
  "      const roundingGrid = 2.5;"

# K5: Kettlebell back-off allows more than one bell drop
test_mutant \
  "Kettlebell back-off allows two bells down" \
  "        if (currentBellIndex > 0 && targetIndex < currentBellIndex - 1) {
          targetIndex = currentBellIndex - 1;
        }" \
  "        if (currentBellIndex > 0 && targetIndex < currentBellIndex - 2) {
          targetIndex = currentBellIndex - 2;
        }"

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
