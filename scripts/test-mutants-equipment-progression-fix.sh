#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for equipment-aware progression fix
# Uses node for reliable string replacement, verifies each mutant changes and compiles,
# restores from backup on ANY exit, runs targeted tests.

HELPER_FILE="src/lib/session/progression-inputs.ts"
ACTIONS_FILE="src/app/session/actions.ts"
PAGE_FILE="src/app/session/[id]/page.tsx"
PROG_FILE="src/lib/program/progression.ts"

HELPER_BACKUP="/tmp/helper-backup-$$.ts"
ACTIONS_BACKUP="/tmp/actions-backup-$$.ts"
PAGE_BACKUP="/tmp/page-backup-$$.ts"
PROG_BACKUP="/tmp/prog-backup-$$.ts"

MUTANT_COUNT=0
SURVIVED_COUNT=0

# Test suite to run for each mutant
TESTS=(
  "npm run test:progression"
  "npm run test:progression-grid"
  "npm run test:progression-call-path"
  "npm run test:no-equipment-exact-equality"
)

echo "=== MUTATION TESTING: equipment progression fix ==="
echo

# Save backups
cp "$HELPER_FILE" "$HELPER_BACKUP"
cp "$ACTIONS_FILE" "$ACTIONS_BACKUP"
cp "$PAGE_FILE" "$PAGE_BACKUP"
cp "$PROG_FILE" "$PROG_BACKUP"
echo "Saved backups"
echo

# Restore on ANY exit
trap 'cp "$HELPER_BACKUP" "$HELPER_FILE" 2>/dev/null; cp "$ACTIONS_BACKUP" "$ACTIONS_FILE" 2>/dev/null; cp "$PAGE_BACKUP" "$PAGE_FILE" 2>/dev/null; cp "$PROG_BACKUP" "$PROG_FILE" 2>/dev/null; rm -f "$HELPER_BACKUP" "$ACTIONS_BACKUP" "$PAGE_BACKUP" "$PROG_BACKUP"' EXIT

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
  cp "$HELPER_BACKUP" "$HELPER_FILE"
  cp "$ACTIONS_BACKUP" "$ACTIONS_FILE"
  cp "$PAGE_BACKUP" "$PAGE_FILE"
  cp "$PROG_BACKUP" "$PROG_FILE"
  
  # Plant mutant using node
  node -e "
const fs = require('fs');
const content = fs.readFileSync('$file', 'utf8');
const original = content;
const newContent = content.replace(\`$find_str\`, \`$replace_str\`);
if (newContent === original) {
  console.log('  ⚠️  STRING NOT FOUND');
  process.exit(1);
}
fs.writeFileSync('$file', newContent);
" 2>/dev/null
  
  if [ $? -ne 0 ]; then
    echo "  ⚠️  REPLACEMENT FAILED"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
    return 1
  fi
  
  # Verify file changed
  if diff -q "$file" "${file/src/tmp}" > /dev/null 2>&1; then
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

# M1: Helper returns empty equipmentIds
test_mutant \
  "Helper drops equipment_ids" \
  "$HELPER_FILE" \
  "equipmentIds: exercise.equipment_ids ?? []," \
  "equipmentIds: [],"

# M2: Helper returns null unit
test_mutant \
  "Helper forces unit to kg" \
  "$HELPER_FILE" \
  'const unit: WeightUnit = userUnits === "imperial" ? "lb" : "kg";' \
  'const unit: WeightUnit = "kg";'

# M3: Helper returns null mechanic
test_mutant \
  "Helper drops mechanic" \
  "$HELPER_FILE" \
  "mechanic: exercise.mechanic," \
  "mechanic: null,"

# M4: actions.ts doesn't spread helper
test_mutant \
  "actions.ts: remove helper spread" \
  "$ACTIONS_FILE" \
  "...progressionInputsFromExercise(ex, profileRes.data?.units)," \
  ""

# M5: page.tsx doesn't spread helper
test_mutant \
  "page.tsx: remove helper spread" \
  "$PAGE_FILE" \
  "...progressionInputsFromExercise(ex ?? { mechanic: null, equipment_ids: [] }, profileRes.data?.units)," \
  ""

# M6: progression.ts reverts equipment back-off
test_mutant \
  "progression.ts: disable equipment back-off" \
  "$PROG_FILE" \
  "if (equipmentIds && unit) {" \
  "if (false && equipmentIds && unit) {"

# M7: progression.ts removes hold-at-increment check
test_mutant \
  "progression.ts: remove hold-at-increment check" \
  "$PROG_FILE" \
  "if (reduced <= liftIncrement) {" \
  "if (false && reduced <= liftIncrement) {"

# M8: first-miss reverts to no-drop
test_mutant \
  "progression.ts: first-miss never drops" \
  "$PROG_FILE" \
  "if (currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {" \
  "if (false && currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {"

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
