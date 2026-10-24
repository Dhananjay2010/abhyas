#!/usr/bin/env bash
# Mutation testing for equipment-aware progression fix
# Tests call-site wiring and helper behavior

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
)

echo "=== MUTATION TESTING: equipment progression fix ==="
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
    baseline_ok=0
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
  printf "%-50s " "[$MUTANT_COUNT] $name"
  
  # Restore originals
  cp "$HELPER_BACKUP" "$HELPER_FILE"
  cp "$ACTIONS_BACKUP" "$ACTIONS_FILE"
  cp "$PAGE_BACKUP" "$PAGE_FILE"
  
  # Plant mutant using node
  node -e "
const fs = require('fs');
const content = fs.readFileSync('$file', 'utf8');
const original = content;
const newContent = content.replace(\`$find_str\`, \`$replace_str\`);
if (newContent === original) {
  console.log('STRING_NOT_FOUND');
  process.exit(1);
}
fs.writeFileSync('$file', newContent);
" 2>/dev/null
  
  if [ $? -ne 0 ]; then
    echo "⚠️  SKIP (string not found)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    return 1
  fi
  
  # Verify file changed
  if cmp -s "$file" "${file/src/tmp}"; then
    echo "⚠️  SKIP (file unchanged)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    return 1
  fi
  
  # Verify still compiles (whole project)
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

# M1: Helper returns empty array instead of omitting
test_mutant \
  "Helper returns [] not {}" \
  "$HELPER_FILE" \
  "return {};" \
  "return { equipmentIds: [], unit: 'kg' };"

# M2: Helper always returns equipmentIds (even for empty array)
test_mutant \
  "Helper ignores empty check" \
  "$HELPER_FILE" \
  "if (!exercise.equipment_ids || exercise.equipment_ids.length === 0) {
    return {};
  }" \
  "if (!exercise.equipment_ids) {
    return {};
  }
  // length check removed - empty array treated as having equipment"

# M3: Helper forces unit to kg
test_mutant \
  "Helper forces unit to kg" \
  "$HELPER_FILE" \
  'const unit: WeightUnit = userUnits === "imperial" ? "lb" : "kg";' \
  'const unit: WeightUnit = "kg";'

# M4: actions.ts doesn't spread helper
test_mutant \
  "actions.ts: remove helper spread" \
  "$ACTIONS_FILE" \
  "...progressionInputsFromExercise(ex, profileRes.data?.units)," \
  ""

# M5': page.tsx doesn't pass equipmentIds/unit
test_mutant \
  "page.tsx: remove equipmentIds/unit args" \
  "$PAGE_FILE" \
  "progInputs.equipmentIds,
        progInputs.unit," \
  ""

# M5'': page.tsx hardcodes mechanic to null
test_mutant \
  "page.tsx: mechanic hardcoded to null" \
  "$PAGE_FILE" \
  "mechanic: ex?.mechanic ?? null," \
  "mechanic: null,"

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
