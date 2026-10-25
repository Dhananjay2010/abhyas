#!/usr/bin/env bash
#
# Mutation tests for PR #124 in-scope code only:
# - Swap list builder / validator (buildEligibleSwapList)
# - Jump guard (lower-body check)
# - Olympic lifts (anyKneeInjury check)
# - Push press / thruster rules
# - Validator acceptance logic
# - Fail-closed reads
# - Past-knee exclusions
#
# Exit 1 on any skip or survivor.

set -e

KILLED=0
SURVIVED=0
SKIPPED=0

echo "PR #124 In-Scope Mutation Testing"
echo "──────────────────────────────────────────────────────────"
echo ""

# Helper functions
mutate_file() {
  local file=$1
  local pattern=$2
  local replacement=$3
  
  cp "$file" "${file}.backup"
  
  if grep -F -q "$pattern" "$file"; then
    # Use perl for literal string replacement
    perl -i -pe "s/\Q$pattern\E/$replacement/g" "$file"
    return 0
  else
    return 1
  fi
}

restore_file() {
  local file=$1
  if [ -f "${file}.backup" ]; then
    mv "${file}.backup" "$file"
  fi
}

run_mutant() {
  local name=$1
  local file=$2
  local pattern=$3
  local replacement=$4
  local test=$5
  
  echo ""
  echo "$name"
  
  if ! mutate_file "$file" "$pattern" "$replacement"; then
    echo "  ⊘ SKIP: Pattern not found"
    SKIPPED=$((SKIPPED + 1))
    restore_file "$file"
    return
  fi
  
  # Check if it compiles
  if ! npx tsc --noEmit 2>/dev/null; then
    echo "  ⊘ SKIP: Does not compile after mutation"
    SKIPPED=$((SKIPPED + 1))
    restore_file "$file"
    return
  fi
  
  # Run test
  if npm run "$test" >/dev/null 2>&1; then
    echo "  ✗ SURVIVED (test passed with mutation)"
    SURVIVED=$((SURVIVED + 1))
  else
    echo "  ✓ KILLED"
    KILLED=$((KILLED + 1))
  fi
  
  restore_file "$file"
}

# 1. Validator always true
run_mutant \
  "Validator: always accept (bypass eligibility check)" \
  "src/lib/session/swap-exercise-for-user.ts" \
  "return ranked.some(e => e.id === validateInput.newExerciseId);" \
  "return true;" \
  "test:swap-list-exhaustive"

# 2. Metric dropped from current-exercise fetch
run_mutant \
  "Current exercise fetch: drop metric field" \
  "src/lib/session/swap-exercise-for-user.ts" \
  ", metric," \
  "," \
  "test:swap-exercise-for-user"

# 3. Sibling read not failing closed
run_mutant \
  "Siblings read: do not fail closed on error" \
  "src/lib/session/swap-exercise-for-user.ts" \
  'if (siblingsRes.error) {
    return { ok: false, error: "Could not load session exercises" };
  }' \
  'if (false) {
    return { ok: false, error: "Could not load session exercises" };
  }' \
  "test:swap-exercise-for-user"

# 4. Sibling exclusion removed
run_mutant \
  "Swap list: remove sibling exclusion" \
  "src/lib/session/eligible-swap-list.ts" \
  ".filter(e => !alreadyInSession.has(e.id))" \
  ".filter(e => true)" \
  "test:swap-list-exhaustive"

# 5. Olympic ban for past knee removed
run_mutant \
  "Olympic lifts: allow for anyKneeInjury" \
  "src/lib/program/past-knee.ts" \
  "if (input.anyKneeInjury) return true;" \
  "if (false) return true;" \
  "test:olympic-lifts"

# 6. KB push press allowed for current knee
run_mutant \
  "KB push press: allow for current knee" \
  "src/lib/program/past-knee.ts" \
  '"one-arm-kettlebell-push-press",' \
  "" \
  "test:past-knee-lunge-swaps"

# 7. Push press banned for past knee (should NOT be in exclusion list)
# Note: This is testing that barbell/dumbbell push press stays allowed
run_mutant \
  "Push press: ban for past knee" \
  "src/lib/program/past-knee.ts" \
  '"one-arm-kettlebell-push-press",' \
  '"barbell-push-press", "one-arm-kettlebell-push-press",' \
  "test:olympic-lifts"

# 8. Thruster allowed for past knee
run_mutant \
  "Thruster: allow for past knee" \
  "src/lib/program/past-knee.ts" \
  '"kettlebell-thruster",' \
  "" \
  "test:olympic-lifts"

# 9. Chest-push-with-run-release allowed
run_mutant \
  "Chest push with run release: allow for past knee" \
  "src/lib/program/past-knee.ts" \
  '"chest-push-with-run-release",' \
  "" \
  "test:past-knee-jump-guard"

# 10. Jump guard disabled
run_mutant \
  "Jump guard: allow all jumps regardless of muscle group" \
  "src/lib/program/past-knee.ts" \
  "const hasLowerBodyPrimary = ex.primary_muscles.some(m => lowerBodyMuscles.has(m));" \
  "const hasLowerBodyPrimary = false;" \
  "test:past-knee-jump-guard"

# 11. Current-knee-only exclusion removed
run_mutant \
  "Current knee only: skip exclusions" \
  "src/lib/program/alternatives.ts" \
  "if (isExcludedForCurrentKneeOnly(candidate)) continue;" \
  "if (false) continue;" \
  "test:swap-list-exhaustive"

# 12. Core ignores the validator
run_mutant \
  "Core: skip validator check" \
  "src/lib/session/swap-exercise-core.ts" \
  "const isValid = await deps.validateSwapTarget({" \
  "const isValid = true || await deps.validateSwapTarget({" \
  "test:swap-exercise-for-user"

# 13. Jump guard over-bans upper-body plyos
run_mutant \
  "Jump guard: ban upper-body plyos (false positive)" \
  "src/lib/program/past-knee.ts" \
  "const hasLowerBodyPrimary = ex.primary_muscles.some(m => lowerBodyMuscles.has(m));" \
  "const hasLowerBodyPrimary = true;" \
  "test:past-knee-jump-guard"

# 14. canSwapExercise check removed
run_mutant \
  "canSwapExercise: skip permission check" \
  "src/app/session/actions.ts" \
  "const guardResult = await canSwapExercise(" \
  "const guardResult = { ok: true, data: true } as const; await (async () => canSwapExercise(" \
  "test:swap-exercise-guard-source"

# Summary
echo ""
echo "──────────────────────────────────────────────────────────"
echo "Mutants killed:   $KILLED"
echo "Mutants survived: $SURVIVED"
echo "Mutants skipped:  $SKIPPED"
echo ""

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
else
  echo "✅ PASSED: All mutants killed"
  exit 0
fi
