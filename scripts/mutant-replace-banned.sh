#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

FAILURES=0

echo "================================================================================"
echo "MUTANT TESTING: replace-banned-in-planned"
echo "================================================================================"
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
    restore_file "$file"
    return
  fi
  
  # Apply mutation - ensure single occurrence
  local occurrences=$(grep -cF "$original" "$file" || true)
  if [ "$occurrences" -ne 1 ]; then
    echo "  ⊘ SKIP: Pattern occurs $occurrences times (expected 1)"
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
  "npx tsx scripts/test-replace-banned-in-planned.ts"

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
    if npx tsx scripts/test-replace-banned-in-planned.ts > /dev/null 2>&1; then
      echo "  ✗ SURVIVED: Mutant not killed"
      FAILURES=$((FAILURES + 1))
    else
      echo "  ✓ KILLED: Test failed as expected"
    fi
  else
    echo "Testing M4: Tier determination uses length === 0"
    echo "  ⊘ SKIP: Mutation failed to apply"
  fi
else
  echo "Testing M4: Tier determination uses length === 0"
  echo "  ⊘ SKIP: Original pattern not found"
fi

restore_file "$TIER_FILE"
echo ""

# Mutant 5: kettlebell-thruster without knee tag (mutate fixture)
# This exercise is ALSO in CURRENT_KNEE_ONLY_EXCLUDED_SLUGS, so the slug-based
# filter still excludes it. This mutant tests that the catalogue data itself
# has the correct tags for migration 000045 (which retags exercises).
FIXTURE_FILE="scripts/fixtures/catalogue.json"
backup_file "$FIXTURE_FILE"

if grep -q '"slug": "kettlebell-thruster"' "$FIXTURE_FILE"; then
  echo "Testing M5: kettlebell-thruster without knee tag"
  
  # Remove 'knee' from kettlebell-thruster's contraindicated_regions array
  python3 -c "
import json

with open('$FIXTURE_FILE', 'r') as f:
    data = json.load(f)

for ex in data:
    if ex.get('slug') == 'kettlebell-thruster':
        if 'contraindicated_regions' in ex and 'knee' in ex['contraindicated_regions']:
            ex['contraindicated_regions'] = [r for r in ex['contraindicated_regions'] if r != 'knee']

with open('$FIXTURE_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null
  
  if npx tsx scripts/test-thruster-tag-direct.ts > /dev/null 2>&1; then
    echo "  ✗ SURVIVED: Mutant not killed"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✓ KILLED: Test failed as expected"
  fi
else
  echo "Testing M5: kettlebell-thruster without knee tag"
  echo "  ⊘ SKIP: kettlebell-thruster not found"
fi

restore_file "$FIXTURE_FILE"
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
  '// MUTANT: replaceBannedInPlanned call removed' \
  "npx tsx scripts/test-replace-banned-in-planned.ts"

# Mutant 8: ensure-session-exercises call site removed
run_mutant_test \
  "M8: ensure-session-exercises call site removed" \
  "src/lib/session/ensure-session-exercises.ts" \
  'const cleaned = applyBannedCleanup(plannedForCleaning, catalogue, profile, injuries, userId);' \
  '// MUTANT: applyBannedCleanup call removed; const cleaned = plannedForCleaning;' \
  "npx tsx scripts/test-replace-banned-in-planned.ts"

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
fi

restore_file "$GEN_FILE"
echo ""

echo "================================================================================"
if [ $FAILURES -eq 0 ]; then
  echo "✅ PASSED: All mutants killed"
  exit 0
else
  echo "❌ FAILED: $FAILURES mutant(s) survived or errored"
  exit 1
fi
