#!/usr/bin/env bash
# Mutation testing for equipment-aware progression fix
# Tests call-site wiring and helper behavior

set -euo pipefail

HELPER_FILE="src/lib/session/progression-inputs.ts"
ACTIONS_FILE="src/app/session/actions.ts"
PAGE_FILE="src/app/session/[id]/page.tsx"

HELPER_BACKUP="/tmp/helper-backup-$$.ts"
ACTIONS_BACKUP="/tmp/actions-backup-$$.ts"
PAGE_BACKUP="/tmp/page-backup-$$.ts"

MUTANT_COUNT=0
KILLED_COUNT=0
SURVIVED_COUNT=0
SKIPPED_COUNT=0

# Test suite to run for each mutant
TESTS=(
  "npm run test:progression"
  "npm run test:progression-grid"
  "npm run test:progression-call-path"
  "npm run test:call-site-wiring"
  "npm run test:no-equipment-exact-equality"
  "npm run test:imperial-wording"
)

echo "=== MUTATION TESTING: equipment progression fix ==="
echo

# Validate all test scripts exist
for test in "${TESTS[@]}"; do
  script_name=$(echo "$test" | sed 's/npm run //')
  if ! grep -q "\"$script_name\":" package.json; then
    echo "ERROR: Test script '$script_name' not found in package.json"
    exit 1
  fi
done
echo "✓ All test scripts validated"
echo

# Save backups
cp "$HELPER_FILE" "$HELPER_BACKUP"
cp "$ACTIONS_FILE" "$ACTIONS_BACKUP"
cp "$PAGE_FILE" "$PAGE_BACKUP"
echo "Saved backups"
echo

# Restore on ANY exit
trap 'cp "$HELPER_BACKUP" "$HELPER_FILE" 2>/dev/null; cp "$ACTIONS_BACKUP" "$ACTIONS_FILE" 2>/dev/null; cp "$PAGE_BACKUP" "$PAGE_FILE" 2>/dev/null; rm -f "$HELPER_BACKUP" "$ACTIONS_BACKUP" "$PAGE_BACKUP"' EXIT

# Check baseline
echo "Running baseline tests..."
baseline_ok=1
for test in "${TESTS[@]}"; do
  if ! $test > /dev/null 2>&1; then
    echo "ERROR: Baseline test failed: $test"
    $test 2>&1 | tail -20
    baseline_ok=0
    break
  fi
done

if [ "$baseline_ok" -eq 0 ]; then
  echo "Baseline must be green before mutation testing"
  exit 1
fi
echo "Baseline: all tests pass"
echo

# Helper to test one mutant
test_mutant() {
  local name="$1"
  local file="$2"
  local find_str="$3"
  local replace_str="$4"
  
  MUTANT_COUNT=$((MUTANT_COUNT + 1))
  printf "%-60s " "[$MUTANT_COUNT] $name"
  
  # Validate search string exists
  if ! grep -qF "$find_str" "$file" 2>/dev/null; then
    echo "⚠️  SKIP (search string not found)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    return 1
  fi
  
  # Restore originals
  cp "$HELPER_BACKUP" "$HELPER_FILE"
  cp "$ACTIONS_BACKUP" "$ACTIONS_FILE"
  cp "$PAGE_BACKUP" "$PAGE_FILE"
  
  # Plant mutant using perl
  perl -i -pe 'BEGIN{undef $/;} s/\Q'"$find_str"'\E/'"$replace_str"'/s' "$file" 2>/dev/null || {
    echo "⚠️  SKIP (perl failed)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    return 1
  }
  
  # Verify file changed (compare against backup)
  local backup_file="$HELPER_BACKUP"
  if [ "$file" = "$ACTIONS_FILE" ]; then
    backup_file="$ACTIONS_BACKUP"
  elif [ "$file" = "$PAGE_FILE" ]; then
    backup_file="$PAGE_BACKUP"
  fi
  
  if cmp -s "$file" "$backup_file"; then
    echo "⚠️  SKIP (file unchanged)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    return 1
  fi
  
  # Verify still compiles
  if ! npm run typecheck > /dev/null 2>&1; then
    echo "⚠️  SKIP (does not compile)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
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
    echo "❌ SURVIVED"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
  else
    echo "✅ KILLED"
    KILLED_COUNT=$((KILLED_COUNT + 1))
  fi
}

# M1: Helper returns equipmentIds/unit for empty
test_mutant \
  "Helper returns equipment for empty array" \
  "$HELPER_FILE" \
  "return {};" \
  "return { equipmentIds: [], unit: 'kg' as WeightUnit };" || true

# M2: Helper forces unit to kg (breaks imperial wording)
test_mutant \
  "Helper forces unit to kg" \
  "$HELPER_FILE" \
  'const unit: WeightUnit = userUnits === "imperial" ? "lb" : "kg";' \
  'const unit: WeightUnit = "kg";' || true

# M3: actions.ts doesn't spread helper
test_mutant \
  "actions.ts: remove helper spread" \
  "$ACTIONS_FILE" \
  "...progressionInputsFromExercise(ex, profileRes.data?.units)," \
  "" || true

# M4: page.tsx hardcodes mechanic to null
test_mutant \
  "page.tsx: mechanic hardcoded to null" \
  "$PAGE_FILE" \
  "mechanic: ex?.mechanic ?? null," \
  "mechanic: null," || true

# M5: page.tsx doesn't select mechanic from exercises
test_mutant \
  "page.tsx: mechanic not selected from exercises" \
  "$PAGE_FILE" \
  "movement_pattern, mechanic, primary_muscles" \
  "movement_pattern, primary_muscles" || true

# M6: page.tsx passes undefined units to helper
test_mutant \
  "page.tsx: undefined units to helper" \
  "$PAGE_FILE" \
  "progressionInputsFromExercise(ex ?? { equipment_ids: [] }, profileRes.data?.units)" \
  "progressionInputsFromExercise(ex ?? { equipment_ids: [] }, undefined)" || true

# M7: page.tsx doesn't pass equipmentIds
test_mutant \
  "page.tsx: remove equipmentIds from suggestedWeight" \
  "$PAGE_FILE" \
  "        progInputs.equipmentIds,
        progInputs.unit," \
  "        progInputs.unit," || true

# M8: page.tsx doesn't pass unit
test_mutant \
  "page.tsx: remove unit from suggestedWeight" \
  "$PAGE_FILE" \
  "progInputs.unit," \
  "" || true

echo
echo "==================================="
echo "Total mutants: $MUTANT_COUNT"
echo "Killed: $KILLED_COUNT"
echo "Survived: $SURVIVED_COUNT"
echo "Skipped: $SKIPPED_COUNT"
echo

if [ "$SURVIVED_COUNT" -gt 0 ] || [ "$SKIPPED_COUNT" -gt 0 ]; then
  echo "❌ MUTATION TEST FAILED"
  exit 1
else
  echo "✅ MUTATION TEST PASSED: All mutants killed"
  exit 0
fi
