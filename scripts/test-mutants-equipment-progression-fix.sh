#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for equipment-aware progression call path fix
# Tests that equipment IDs, units, and exercise type reach the progression function
# and that back-off snaps to equipment grids (not just kettlebells).

ACTIONS_FILE="src/app/session/actions.ts"
PAGE_FILE="src/app/session/[id]/page.tsx"
PROG_FILE="src/lib/program/progression.ts"
ACTIONS_BACKUP="/tmp/actions-backup-$$.ts"
PAGE_BACKUP="/tmp/page-backup-$$.ts"
PROG_BACKUP="/tmp/prog-backup-$$.ts"
MUTANT_COUNT=0
SURVIVED_COUNT=0

# Targeted test scripts
TESTS=(
  "npm run test:progression-call-path"
  "npm run test:progression"
  "npm run test:progression-grid"
)

echo "=== MUTATION TESTING: equipment progression fix ==="
echo

# Save backups
cp "$ACTIONS_FILE" "$ACTIONS_BACKUP"
cp "$PAGE_FILE" "$PAGE_BACKUP"
cp "$PROG_FILE" "$PROG_BACKUP"
echo "Saved backups"
echo

# Restore on ANY exit
trap 'cp "$ACTIONS_BACKUP" "$ACTIONS_FILE" 2>/dev/null; cp "$PAGE_BACKUP" "$PAGE_FILE" 2>/dev/null; cp "$PROG_BACKUP" "$PROG_FILE" 2>/dev/null; rm -f "$ACTIONS_BACKUP" "$PAGE_BACKUP" "$PROG_BACKUP"' EXIT

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
  local file="$2"
  local find_str="$3"
  local replace_str="$4"
  
  MUTANT_COUNT=$((MUTANT_COUNT + 1))
  echo "[$MUTANT_COUNT] $name"
  
  # Restore originals
  cp "$ACTIONS_BACKUP" "$ACTIONS_FILE"
  cp "$PAGE_BACKUP" "$PAGE_FILE"
  cp "$PROG_BACKUP" "$PROG_FILE"
  
  # Check string exists
  if ! grep -qF "$find_str" "$file"; then
    echo "  ⚠️  STRING NOT FOUND (no-op mutant)"
    echo
    echo "==================================="
    echo "Total mutants: $MUTANT_COUNT"
    echo "STRING NOT FOUND ERROR in mutant: $name"
    echo "File: $file"
    echo
    echo "❌ MUTATION TEST FAILED: string not found"
    exit 1
  fi
  
  # Plant mutant
  python3 -c "
import sys
with open('$file', 'r') as f:
    content = f.read()
original = content
content = content.replace('''$find_str''', '''$replace_str''', 1)
with open('$file', 'w') as f:
    f.write(content)
sys.exit(0 if content != original else 1)
" 2>/dev/null
  
  if [ $? -ne 0 ]; then
    echo "  ⚠️  REPLACEMENT FAILED"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Verify file changed
  local backup_file
  if [ "$file" = "$ACTIONS_FILE" ]; then
    backup_file="$ACTIONS_BACKUP"
  elif [ "$file" = "$PAGE_FILE" ]; then
    backup_file="$PAGE_BACKUP"
  else
    backup_file="$PROG_BACKUP"
  fi
  
  if diff -q "$backup_file" "$file" > /dev/null 2>&1; then
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

# M1: Drop equipment at actions.ts call site
test_mutant \
  "actions.ts: drop equipment from progression call" \
  "$ACTIONS_FILE" \
  "    ...progressionInputsFromExercise(ex, profileRes.data?.units)," \
  "    equipmentIds: undefined, unit: undefined, mechanic: ex.mechanic,"

# M2: Drop units at actions.ts call site
test_mutant \
  "actions.ts: drop units from progression call" \
  "$ACTIONS_FILE" \
  "    ...progressionInputsFromExercise(ex, profileRes.data?.units)," \
  "    equipmentIds: ex.equipment_ids, unit: undefined, mechanic: ex.mechanic,"

# M3: Drop mechanic at actions.ts call site
test_mutant \
  "actions.ts: drop mechanic from progression call" \
  "$ACTIONS_FILE" \
  "    ...progressionInputsFromExercise(ex, profileRes.data?.units)," \
  "    equipmentIds: ex.equipment_ids, unit: (profileRes.data?.units === 'imperial' ? 'lb' : 'kg'), mechanic: null,"

# M4: Drop equipment at page.tsx call site
test_mutant \
  "page.tsx: drop equipment from suggestedWeight call" \
  "$PAGE_FILE" \
  "        ...progressionInputsFromExercise(ex ?? { mechanic: null, equipment_ids: [] }, profileRes.data?.units)," \
  "        undefined, undefined,"

# M5: Drop units at page.tsx call site
test_mutant \
  "page.tsx: drop units from suggestedWeight call" \
  "$PAGE_FILE" \
  "        ...progressionInputsFromExercise(ex ?? { mechanic: null, equipment_ids: [] }, profileRes.data?.units)," \
  "        (ex ?? { mechanic: null, equipment_ids: [] }).equipment_ids, undefined,"

# M6: Revert dumbbell back-off snap
test_mutant \
  "progression.ts: revert dumbbell back-off to old 2.5 grid" \
  "$PROG_FILE" \
  "      } else {
        // Standard equipment: snap down to equipment grid, drop at most one grid step
        const gridStep = equipmentGridStep(equipmentIds, 'kg');
        const snapped = roundToGrid(rawReduced, equipmentIds, unit, gridStep, 'down');
        // Never drop more than one grid step below current
        const oneStepDown = currentWeight - gridStep;
        reduced = Math.max(snapped, oneStepDown);
      }" \
  "      } else {
        // Old behavior: use 2.5 kg grid
        const roundingGrid = meta.mechanic === 'isolation' ? 1.25 : 2.5;
        const snapped = Math.floor(rawReduced / roundingGrid) * roundingGrid;
        const minAllowed = rawReduced - liftIncrement;
        reduced = Math.max(snapped, minAllowed);
      }"

# M7: Revert pin-stack back-off snap
test_mutant \
  "progression.ts: revert pin-stack back-off to old 2.5 grid" \
  "$PROG_FILE" \
  "        const gridStep = equipmentGridStep(equipmentIds, 'kg');" \
  "        const gridStep = 2.5;"

# M8: Revert medicine ball back-off snap
test_mutant \
  "progression.ts: revert medicine ball back-off to old 2.5 grid" \
  "$PROG_FILE" \
  "        const snapped = roundToGrid(rawReduced, equipmentIds, unit, gridStep, 'down');" \
  "        const snapped = Math.floor(rawReduced / 2.5) * 2.5;"

# M9: Revert cable back-off snap
test_mutant \
  "progression.ts: drop equipmentIds in back-off roundToGrid call" \
  "$PROG_FILE" \
  "        const snapped = roundToGrid(rawReduced, equipmentIds, unit, gridStep, 'down');" \
  "        const snapped = roundToGrid(rawReduced, undefined, unit, gridStep, 'down');"

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
