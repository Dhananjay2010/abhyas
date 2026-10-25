#!/usr/bin/env bash
#
# Mutation tests for PR #124's in-scope swap-safety code.
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file (otherwise the mutant is reported as SKIPPED, never silently a no-op).
# A mutant that does not type-check is also SKIPPED: it must be killed by a
# behavioural test, not by tsc. The original file is always restored (trap).
#
# Exit 1 on any skip or survivor.

set -u

KILLED=0
SURVIVED=0
SKIPPED=0
CURRENT_FILE=""
BACKUP=""

restore() {
  if [ -n "$CURRENT_FILE" ] && [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$CURRENT_FILE"
    rm -f "$BACKUP"
  fi
  CURRENT_FILE=""
  BACKUP=""
}
trap restore EXIT INT TERM

# replace_once FILE OLD NEW -> 0 if OLD occurred exactly once and was replaced
replace_once() {
  FILE="$1" OLD="$2" NEW="$3" node -e '
    const fs = require("fs");
    const { FILE, OLD, NEW } = process.env;
    const src = fs.readFileSync(FILE, "utf8");
    const n = src.split(OLD).length - 1;
    if (n !== 1) { console.error(`  pattern occurs ${n} times`); process.exit(1); }
    fs.writeFileSync(FILE, src.replace(OLD, () => NEW));
  '
}

# run_mutant NAME FILE OLD NEW TEST...
run_mutant() {
  local name=$1 file=$2 old=$3 new=$4
  shift 4
  echo ""
  echo "$name"
  CURRENT_FILE="$file"
  BACKUP="$(mktemp)"
  cp "$file" "$BACKUP"

  if ! replace_once "$file" "$old" "$new"; then
    echo "  ⊘ SKIP: pattern not found exactly once"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  if ! npx tsc --noEmit >/dev/null 2>&1; then
    echo "  ⊘ SKIP: does not compile (must be killed by a test, not tsc)"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  local killer=""
  for t in "$@"; do
    if ! npm run -s "$t" >/dev/null 2>&1; then
      killer="$t"
      break
    fi
  done
  if [ -n "$killer" ]; then
    echo "  ✓ KILLED by $killer"
    KILLED=$((KILLED + 1))
  else
    echo "  ✗ SURVIVED ($*)"
    SURVIVED=$((SURVIVED + 1))
  fi
  restore
}

FOR_USER=src/lib/session/swap-exercise-for-user.ts
CORE=src/lib/session/swap-exercise-core.ts
LIST=src/lib/session/eligible-swap-list.ts
PAST_KNEE=src/lib/program/past-knee.ts
ALT=src/lib/program/alternatives.ts
ACTIONS=src/app/session/actions.ts
B=test:swap-safety-behaviour
X=test:swap-list-exhaustive

echo "PR #124 In-Scope Mutation Testing"
echo "──────────────────────────────────────────────────────────"

npm run -s "$B" >/dev/null 2>&1 || { echo "FATAL: baseline $B fails"; exit 1; }

run_mutant "1. Validator: always accept" "$FOR_USER" \
  'return ranked.some(e => e.id === validateInput.newExerciseId);' \
  'return true;' "$B"

run_mutant "2. Server loses the current exercise's real metric (exhaustive gate; dropping the column itself is now a tsc error)" "$FOR_USER" \
  'const currentExercise: CandidateExercise = currentExerciseRes.data;' \
  'const currentExercise: CandidateExercise = { ...currentExerciseRes.data, metric: "seconds" };' "$X"

run_mutant "2b. Server loses the current exercise's real metric (behavioural)" "$FOR_USER" \
  'const currentExercise: CandidateExercise = currentExerciseRes.data;' \
  'const currentExercise: CandidateExercise = { ...currentExerciseRes.data, metric: "seconds" };' "$B"

run_mutant "3. Siblings read: do not fail closed" "$FOR_USER" \
  'if (siblingsRes.error) {' \
  'if (false && siblingsRes.error) {' "$B"

run_mutant "4. Swap list: remove sibling exclusion" "$LIST" \
  '.filter(e => !alreadyInSession.has(e.id))' \
  '.filter(e => e.id !== "")' "$B"

run_mutant "5. Olympic lifts: allow for anyKneeInjury" "$PAST_KNEE" \
  'if (input.anyKneeInjury) return true;' \
  'if (input.anyKneeInjury) return false;' "$B"

run_mutant "6. KB push press: allow for current knee" "$PAST_KNEE" \
  '  "one-arm-kettlebell-push-press",
]);' \
  ']);' "$B"

run_mutant "7. Push press: ban for past knee" "$PAST_KNEE" \
  '  "kettlebell-thruster",' \
  '  "kettlebell-thruster", "one-arm-kettlebell-push-press",' "$B"

run_mutant "8. Thruster: allow for past knee" "$PAST_KNEE" \
  '  "kettlebell-thruster",' \
  '' "$B"

run_mutant "9. Chest push with run release: allow for past knee" "$PAST_KNEE" \
  '  "chest-push-with-run-release",' \
  '' "$B"

run_mutant "10. Jump guard: lower-body check disabled" "$PAST_KNEE" \
  'const hasLowerBodyPrimary = ex.primary_muscles.some(m => lowerBodyMuscles.has(m));' \
  'const hasLowerBodyPrimary = ex.primary_muscles.some(m => lowerBodyMuscles.has(m)) && false;' "$B"

run_mutant "11. Current knee only: skip exclusions in swap ranking" "$ALT" \
  '(hasKneeInjury && (isExcludedForCurrentKneeOnly(candidate) || isExcludedForPastKnee(candidate)))' \
  '(hasKneeInjury && (false || isExcludedForPastKnee(candidate)))' "$B"

run_mutant "12. Core: skip validator result" "$CORE" \
  'if (!isValid) {' \
  'if (false && !isValid) {' "$B"

run_mutant "13. Jump guard: ban upper-body plyos (false positive)" "$PAST_KNEE" \
  'const hasLowerBodyPrimary = ex.primary_muscles.some(m => lowerBodyMuscles.has(m));' \
  'const hasLowerBodyPrimary = ex.primary_muscles.some(m => lowerBodyMuscles.has(m)) || true;' "$B"

run_mutant "14. canSwapExercise: guard result ignored" "$ACTIONS" \
  'if (!guardResult.allowed) {' \
  'if (!guardResult.allowed && guardResult.error === "mutant: never matches") {' "$B"

run_mutant "15. Thruster (past-knee list): re-allow for current knee in swaps" "$ALT" \
  '(hasKneeInjury && (isExcludedForCurrentKneeOnly(candidate) || isExcludedForPastKnee(candidate)))' \
  '(hasKneeInjury && isExcludedForCurrentKneeOnly(candidate))' "$B"

run_mutant "16. Subset leak: backfill current-knee lists after exclusions (subset proof)" "$ALT" \
  'if (prExcluded && hasPastKnee) continue;' \
  'if (prExcluded) continue;' "$X"

run_mutant "17. Olympic lifts: re-allow for past-knee in swaps (past-knee ban check)" "$PAST_KNEE" \
  'if (input.anyKneeInjury) return true;' \
  'if (false) return true;' "$X"

echo ""
echo "──────────────────────────────────────────────────────────"
echo "Mutants killed:   $KILLED"
echo "Mutants survived: $SURVIVED"
echo "Mutants skipped:  $SKIPPED"
echo ""

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
fi
echo "✅ PASSED: All mutants killed"
