#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

FAILURES=0

echo "================================================================================"
echo "MUTANT TESTING: replace-banned-in-planned"
echo "================================================================================"
echo ""

# Baseline check: run target test unmutated first
echo "Running baseline tests (unmutated)..."
if ! npx tsx scripts/test-replace-banned-in-planned.ts > /dev/null 2>&1; then
  echo "❌ ABORT: Baseline test fails unmutated"
  exit 1
fi
echo "✓ Baseline tests pass"
echo ""

# Create temporary backups
BACKUP_DIR=$(mktemp -d)
trap 'rm -rf "$BACKUP_DIR"' EXIT

backup_file() {
  local file="$1"
  cp "$file" "$BACKUP_DIR/$(basename "$file")"
}

restore_file() {
  local file="$1"
  cp "$BACKUP_DIR/$(basename "$file")" "$file"
}

run_mutant_test() {
  local name="$1"
  local file="$2"
  local original="$3"
  local mutated="$4"
  local test_command="$5"
  
  echo "Testing $name"
  
  backup_file "$file"
  
  # Check anchor exists
  if ! grep -qF "$original" "$file"; then
    echo "  ⊘ SKIP: Original pattern not found"
    FAILURES=$((FAILURES + 1))
    restore_file "$file"
    return
  fi
  
  # Apply mutation - ensure single occurrence
  local occurrences=$(grep -cF "$original" "$file" || true)
  if [ "$occurrences" -ne 1 ]; then
    echo "  ⊘ SKIP: Pattern occurs $occurrences times (expected 1)"
    FAILURES=$((FAILURES + 1))
    restore_file "$file"
    return
  fi
  
  # Apply the mutation
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS sed syntax
    sed -i '' "s|$(echo "$original" | sed 's/[]\/$*.^[]/\\&/g')|$mutated|" "$file"
  else
    # Linux sed syntax
    sed -i "s|$(echo "$original" | sed 's/[]\/$*.^[]/\\&/g')|$mutated|" "$file"
  fi
  
  # Verify mutation was applied
  if grep -qF "$original" "$file"; then
    echo "  ✗ ERROR: Mutation failed to apply"
    FAILURES=$((FAILURES + 1))
    restore_file "$file"
    return
  fi
  
  # Run test
  if eval "$test_command" > /dev/null 2>&1; then
    echo "  ✗ SURVIVED: Mutant not killed"
    FAILURES=$((FAILURES + 1))
  else
    local exit_code=$?
    if [ $exit_code -eq 139 ] || [ $exit_code -eq 134 ]; then
      echo "  ✗ ERROR: Crash (exit $exit_code) - crashes don't count as kills"
      FAILURES=$((FAILURES + 1))
    else
      echo "  ✓ KILLED: Test failed as expected"
    fi
  fi
  
  restore_file "$file"
  echo ""
}

# Mutant 1: Past-tier ban dropped (remove calf-press from past-tier list)
run_mutant_test \
  "M1: Past-tier ban dropped" \
  "src/lib/program/past-knee.ts" \
  '"calf-press-on-the-leg-press-machine",' \
  '// MUTANT: calf-press-on-the-leg-press-machine removed' \
  "npx tsx scripts/test-past-knee-calf-press-banned.ts"

# Mutant 2: Current tier uses past list only
run_mutant_test \
  "M2: Current tier uses past list only" \
  "src/lib/program/past-knee.ts" \
  '...Array.from(CURRENT_KNEE_ONLY_EXCLUDED_SLUGS),' \
  '// MUTANT: Current knee only exclusions removed' \
  "npx tsx scripts/test-replace-banned-in-planned.ts"

# Mutant 3: No-op replacement function
run_mutant_test \
  "M3: No-op replacement" \
  "src/lib/program/replace-banned-in-planned.ts" \
  'const needsReplacement = shouldReplaceBannedExercise(exercise.slug, tier);' \
  'const needsReplacement = false; // MUTANT: always false' \
  "npx tsx scripts/test-replace-banned-in-planned.ts"

# Mutant 4: Tier determination wrong (uses length === 0)
TIER_FILE="src/lib/program/replace-banned-in-planned.ts"
backup_file "$TIER_FILE"

if grep -q 'const hasCurrentKnee = currentInjuryRegions.includes("knee");' "$TIER_FILE"; then
  # Apply mutation with proper string escaping
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/const hasCurrentKnee = currentInjuryRegions\.includes("knee");/const hasCurrentKnee = currentInjuryRegions.length === 0; \/\/ MUTANT/' "$TIER_FILE"
  else
    sed -i 's/const hasCurrentKnee = currentInjuryRegions\.includes("knee");/const hasCurrentKnee = currentInjuryRegions.length === 0; \/\/ MUTANT/' "$TIER_FILE"
  fi
  
  if grep -q 'MUTANT' "$TIER_FILE"; then
    echo "Testing M4: Tier determination uses length === 0"
    if npx tsx scripts/test-knee-tier-determination.ts > /dev/null 2>&1; then
      echo "  ✗ SURVIVED: Mutant not killed"
      FAILURES=$((FAILURES + 1))
    else
      echo "  ✓ KILLED: Test failed as expected"
    fi
  else
    echo "Testing M4: Tier determination uses length === 0"
    echo "  ⊘ SKIP: Mutation failed to apply"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "Testing M4: Tier determination uses length === 0"
  echo "  ⊘ SKIP: Original pattern not found"
fi

restore_file "$TIER_FILE"
echo ""

# Mutant 5: Remove kettlebell-thruster from CURRENT_KNEE_ONLY_EXCLUDED_SLUGS
# Decision (a): kettlebell-thruster is pinned in CURRENT_KNEE_ONLY_EXCLUDED_SLUGS
# for current-knee exclusion. Removing it must be killed by the pin test AND
# at least one behavioural path test (e.g. generator test).
# NOTE: kettlebell-thruster also exists in PAST_KNEE_EXCLUDED_SLUGS (for both tiers),
# so we need to remove it from BOTH lists for the behavioural test to catch it.
PAST_KNEE_FILE="src/lib/program/past-knee.ts"
backup_file "$PAST_KNEE_FILE"

if grep -q '"kettlebell-thruster",' "$PAST_KNEE_FILE"; then
  echo "Testing M5: Remove kettlebell-thruster from both PAST and CURRENT lists"
  
  # Remove kettlebell-thruster from both lists
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' '/"kettlebell-thruster",/d' "$PAST_KNEE_FILE"
  else
    sed -i '/"kettlebell-thruster",/d' "$PAST_KNEE_FILE"
  fi
  
  # Run both the pin test and the behavioural test
  PIN_PASSED=false
  BEHAVIOURAL_PASSED=false
  
  if npx tsx scripts/test-current-knee-thruster-pin.ts > /dev/null 2>&1; then
    echo "  ✗ Pin test SURVIVED"
  else
    PIN_PASSED=true
  fi
  
  if npx tsx scripts/test-pickforslot-current-knee-thruster.ts > /dev/null 2>&1; then
    echo "  ✗ Behavioural test SURVIVED"
  else
    BEHAVIOURAL_PASSED=true
  fi
  
  if [ "$PIN_PASSED" = true ] && [ "$BEHAVIOURAL_PASSED" = true ]; then
    echo "  ✓ KILLED: Both pin test and behavioural test failed as expected"
  else
    echo "  ✗ SURVIVED: Mutant not killed by both tests"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "Testing M5: Remove kettlebell-thruster from both PAST and CURRENT lists"
  echo "  ⊘ SKIP: kettlebell-thruster not found"
fi

restore_file "$PAST_KNEE_FILE"
echo ""

# Mutant 6: Math.random tie-break
run_mutant_test \
  "M6: Math.random tie-break" \
  "src/lib/session/eligible-swap-list.ts" \
  'const tieBreakFn = (slug: string) => hashString(`${sessionExerciseId}:${slug}`);' \
  'const tieBreakFn = (slug: string) => Math.random(); // MUTANT' \
  "npx tsx scripts/test-replace-banned-in-planned.ts"

# Mutant 7: Today call site removed
run_mutant_test \
  "M7: Today call site removed" \
  "src/app/today/page.tsx" \
  'const result = replaceBannedInPlanned(planned, catalogue, generatorInput);' \
  'const result = { changed: false, rows: planned }; // MUTANT' \
  "npx tsx scripts/test-today-page-cleanup-path.ts"

# Mutant 8 / W3: ensure-session-exercises call site removed
run_mutant_test \
  "M8/W3: ensure-session-exercises call site removed" \
  "src/lib/session/ensure-session-exercises.ts" \
  'const cleaned = applyBannedCleanup(planned, catalogue, profile, injuries, userId, equipmentIds);' \
  'const cleaned = { rows: planned, changed: false }; // MUTANT' \
  "npx tsx scripts/test-ensure-session-call-site.ts"

# Mutant 9: generate.ts:828 reverted to past-only
GEN_FILE="src/lib/program/generate.ts"
backup_file "$GEN_FILE"

# Need to handle special regex characters carefully
ORIGINAL_LINE='.filter((item) => !(hasCurrentKnee && (isExcludedForPastKnee(item.e) || isExcludedForCurrentKneeOnly(item.e))));'

if grep -qF "$ORIGINAL_LINE" "$GEN_FILE"; then
  # Apply mutation
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|.*hasCurrentKnee.*isExcludedForPastKnee.*isExcludedForCurrentKneeOnly.*|      // MUTANT: current-knee filter removed|" "$GEN_FILE"
  else
    sed -i "s|.*hasCurrentKnee.*isExcludedForPastKnee.*isExcludedForCurrentKneeOnly.*|      // MUTANT: current-knee filter removed|" "$GEN_FILE"
  fi
  
  echo "Testing M9: generate.ts:828 reverted to past-only"
  if npx tsx scripts/test-generate-current-knee-filter.ts > /dev/null 2>&1; then
    echo "  ✗ SURVIVED: Mutant not killed"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✓ KILLED: Test failed as expected"
  fi
else
  echo "Testing M9: generate.ts:828 reverted to past-only"
  echo "  ⊘ SKIP: Original pattern not found"
  FAILURES=$((FAILURES + 1))
fi

restore_file "$GEN_FILE"
echo ""

# Mutant 10 / W1: start-session cleanup call removed
run_mutant_test \
  "M10/W1: start-session cleanup removed" \
  "src/lib/session/start-session-full-deps.ts" \
  'const cleaned = applyBannedCleanup(' \
  'const cleaned = { rows: plannedForCleaning, changed: false }; if (false) { applyBannedCleanup(' \
  "npx tsx scripts/test-start-session-call-site.ts"

# Mutant 11: Force-add filter removed (killed by synthetic-catalogue test)
run_mutant_test \
  "M11: Force-add current-knee filter removed" \
  "src/lib/program/generate.ts" \
  'if (isExcludedForCurrentKneeOnly(e)) return false;' \
  '// MUTANT: isExcludedForCurrentKneeOnly check removed' \
  "npx tsx scripts/test-force-add-banned-synthetic.ts"

# Mutant W2: start-session cleanBannedExercises returns input unchanged
run_mutant_test \
  "W2: start-session cleanBannedExercises no-op" \
  "src/lib/session/start-session-full-deps.ts" \
  'async cleanBannedExercises(exercises) {' \
  'async cleanBannedExercises(exercises) { return exercises; if (false) {' \
  "npx tsx scripts/test-start-session-call-site.ts"

# Mutant W5: Today applyDayCleanup returns day unchanged
run_mutant_test \
  "W5: Today applyDayCleanup no-op" \
  "src/app/today/page.tsx" \
  'export function applyDayCleanup(' \
  'export function applyDayCleanup(day: any) { return day; } function applyDayCleanupMutated(' \
  "npx tsx scripts/test-today-page-cleanup-path.ts"

# Mutant W6: cleanup touches logged data tables
run_mutant_test \
  "W6: cleanup table isolation broken" \
  "src/lib/program/clean-banned-planned.ts" \
  'from("program_day_exercises")' \
  'from("session_exercises") // MUTANT: wrong table' \
  "npx tsx scripts/test-cleanup-table-isolation.ts"

# Mutant H2: ensureSessionExercises not called on resume
run_mutant_test \
  "H2: ensureSessionExercises unwired on resume" \
  "src/lib/session/start-session-full-core.ts" \
  'deps.ensureSessionExercises(existing.id),' \
  '// MUTANT: ensureSessionExercises removed' \
  "npx tsx scripts/test-start-session-call-site.ts"

# Mutant L1: drop-slot handling crashes
run_mutant_test \
  "L1: drop-slot crashes" \
  "src/lib/program/replace-banned-in-planned.ts" \
  'if (cleanedExerciseId === undefined) {' \
  'if (false && cleanedExerciseId === undefined) { // MUTANT: no drop handling' \
  "npx tsx scripts/test-drop-slot-handling.ts"

echo "================================================================================"
if [ $FAILURES -eq 0 ]; then
  echo "✅ PASSED: All mutants killed"
  exit 0
else
  echo "❌ FAILED: $FAILURES mutant(s) survived or errored"
  exit 1
fi
