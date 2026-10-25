#!/usr/bin/env bash
# Mutation testing for equipment progression fix
# Validates: Rule 2 clamp, one-step increase cap, hold reasons, two-miss RAW 90% cap, mode weight, timed success

set -euo pipefail

PROG="src/lib/program/progression.ts"
ACTIONS="src/app/session/actions.ts"
BUILDER="src/lib/session/build-runner-exercises.ts"
CORE="src/lib/session/apply-progression-core.ts"

BACKUP=$(mktemp /tmp/prog-backup.XXXXXX.ts)
ACTIONS_BACKUP=$(mktemp /tmp/actions-backup.XXXXXX.ts)
BUILDER_BACKUP=$(mktemp /tmp/builder-backup.XXXXXX.ts)
CORE_BACKUP=$(mktemp /tmp/core-backup.XXXXXX.ts)

cp "$PROG" "$BACKUP"
cp "$ACTIONS" "$ACTIONS_BACKUP"
cp "$BUILDER" "$BUILDER_BACKUP"
cp "$CORE" "$CORE_BACKUP"
[ -s "$BACKUP" ] || exit 1
[ -s "$ACTIONS_BACKUP" ] || exit 1
[ -s "$BUILDER_BACKUP" ] || exit 1
[ -s "$CORE_BACKUP" ] || exit 1

COUNT=0
KILLED=0
SURVIVED=0
SKIPPED=0

restore() {
  [ -f "$BACKUP" ] && cp "$BACKUP" "$PROG"
  [ -f "$ACTIONS_BACKUP" ] && cp "$ACTIONS_BACKUP" "$ACTIONS"
  [ -f "$BUILDER_BACKUP" ] && cp "$BUILDER_BACKUP" "$BUILDER"
  [ -f "$CORE_BACKUP" ] && cp "$CORE_BACKUP" "$CORE"
}

cleanup() {
  restore
  rm -f "$BACKUP" "$ACTIONS_BACKUP" "$BUILDER_BACKUP" "$CORE_BACKUP"
}

trap cleanup EXIT
trap 'cleanup; exit 1' INT TERM

echo "✓ Backups created"
echo

TESTS=(
  "npm run test:first-miss-pinned"
  "npm run test:first-miss-two-miss-invariant"
  "npm run test:increase-cap"
  "npm run test:message-weight-consistency"
  "npm run test:kettlebell-success"
  "npm run test:timed-hold-message"
  "npm run test:undo-consistency"
  "npm run test:progression-display-target-consistency"
  "npm run test:progression-display-consistency"
  "npm run test:qa-bot-1-full-path"
  "npm run test:call-site-wiring"
)

echo "=== MUTATION TESTING: equipment progression fix ==="
echo

echo "Running baseline..."
for t in "${TESTS[@]}"; do
  if ! $t > /dev/null 2>&1; then
    echo "❌ Baseline failed: $t"
    $t 2>&1 | tail -30
    exit 1
  fi
done
echo "✅ Baseline pass"
echo

test_mutant() {
  local name="$1"
  local fn="$2"
  local mutated_file="${3:-PROG}"
  
  COUNT=$((COUNT + 1))
  printf "%-75s " "[$COUNT] $name"
  
  restore
  
  if ! $fn 2>/dev/null; then
    echo "⚠️  SKIP (mutation failed)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  # Check if mutation actually changed something
  local changed=0
  case "$mutated_file" in
    PROG)
      cmp -s "$PROG" "$BACKUP" || changed=1
      ;;
    ACTIONS)
      cmp -s "$ACTIONS" "$ACTIONS_BACKUP" || changed=1
      ;;
    BUILDER)
      cmp -s "$BUILDER" "$BUILDER_BACKUP" || changed=1
      ;;
    CORE)
      cmp -s "$CORE" "$CORE_BACKUP" || changed=1
      ;;
  esac
  
  if [ "$changed" -eq 0 ]; then
    echo "⚠️  SKIP (unchanged)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "⚠️  SKIP (no compile)"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  
  local fail=0
  for t in "${TESTS[@]}"; do
    if ! $t > /dev/null 2>&1; then
      fail=1
      break
    fi
  done
  
  restore
  
  # Verify restore worked
  if ! cmp -s "$PROG" "$BACKUP"; then
    echo "❌ ERROR: restore failed (progression.ts)"
    exit 1
  fi
  if ! cmp -s "$ACTIONS" "$ACTIONS_BACKUP"; then
    echo "❌ ERROR: restore failed (actions.ts)"
    exit 1
  fi
  if ! cmp -s "$BUILDER" "$BUILDER_BACKUP"; then
    echo "❌ ERROR: restore failed (build-runner-exercises.ts)"
    exit 1
  fi
  if ! cmp -s "$CORE" "$CORE_BACKUP"; then
    echo "❌ ERROR: restore failed (apply-progression-core.ts)"
    exit 1
  fi
  
  if [ "$fail" -eq 0 ]; then
    echo "❌ SURVIVED"
    SURVIVED=$((SURVIVED + 1))
  else
    echo "✅ KILLED"
    KILLED=$((KILLED + 1))
  fi
}

# M1: Remove Rule 2 clamp
m1() {
  # Comment out lines: const twoMissFloor through the closing brace of the inner if
  sed -i '/const twoMissFloor = Math\.max(mainFloor, rawTwoMiss);/{N;N;N;N;s/^/\/\/ MUTANT: /;s/\n/\n\/\/ MUTANT: /g;}' "$PROG"
}
test_mutant "Remove Rule 2 clamp (allow first-miss < two-miss)" m1

# M2: Replace mode with heaviest for base
m2() {
  sed -i 's/const baseWeight = modeWeight > 0 ? modeWeight : state\.currentWorkingWeightKg;/const baseWeight = (working.length > 0 ? heaviest : null) ?? state.currentWorkingWeightKg;/' "$PROG"
}
test_mutant "Replace mode with heaviest for base" m2

# M3: Change tie->higher (reject tie->lower)
m3() {
  sed -i 's/count > maxCount || (count === maxCount && w < modeWeight)/count > maxCount || (count === maxCount \&\& w > modeWeight)/' "$PROG"
}
test_mutant "Change tie->higher (should choose lower)" m3

# M4: 14->17.5 overshoot (allow multi-step increase)
m4() {
  sed -i 's/next = nextGrid;/next = from + 2 * gridStep;/' "$PROG"
}
test_mutant "14->17.5 overshoot (multi-step increase)" m4

# M5: Overwrite smallest-weight holdReason (allow Rule 1 to overwrite)
m5() {
  # Remove the early return that prevents Rule 1 from overwriting 'smallest'
  sed -i '/if (candidateWeight === 0) {/,/holdReason = .smallest.;/{s/candidateWeight = currentWeight;/\/\/ candidateWeight = currentWeight;/; s/holdReason = .smallest.;/\/\/ holdReason = '\''smallest'\'';/}' "$PROG"
}
test_mutant "Allow overwriting holdReason=smallest" m5

# M6: Rounded cap with equipment (use snapped instead of RAW)
m6() {
  # In computeTwoMissResult, change "target = rawReduced;" to use snapped logic
  sed -i '/\/\/ RAW 90% cap with equipment/,/target = rawReduced;/{s/target = rawReduced;/const roundingGrid = meta.mechanic === "isolation" ? 1.25 : 2.5; target = Math.floor(rawReduced \/ roundingGrid) * roundingGrid;/}' "$PROG"
}
test_mutant "Rounded cap with equipment (use snapped instead of RAW)" m6

# M7: Disable Rule 1 (20% cut guard) - set threshold to 100% so it never triggers
m7() {
  sed -i 's/if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {/if (cutFraction > 1.0) {/' "$PROG"
}
test_mutant "Disable Rule 1 (allow >20% cuts)" m7

# M8: RAW target rejected (need strictly above)
m8() {
  sed -i 's/if (bell >= target - 0\.001 && bell < weight - 0\.001) {/if (bell > target \&\& bell < weight) {/' "$PROG"
}
test_mutant "RAW target rejected (need strictly above)" m8

# M9: Success check ignores stored target (always use plan)
m9() {
  sed -i 's/currentTargetReps: state\.currentTargetReps,$/currentTargetReps: null,/' "$PROG"
}
test_mutant "Success check ignores stored target (always use plan)" m9

# M10: Success check uses stored weight instead of state weight
m10() {
  sed -i 's/currentWorkingWeightKg: state\.currentWorkingWeightKg,$/currentWorkingWeightKg: null,/' "$PROG"
}
test_mutant "Success check uses stored weight instead of state weight" m10

# M11: Remove reps cap (2×repsMax)
m11() {
  sed -i 's/const ceiling = isTimed ? HOLD_CEILING_SECONDS : 2 \* repsMax;/const ceiling = isTimed ? HOLD_CEILING_SECONDS : 999;/' "$PROG"
}
test_mutant "Remove reps cap (2×repsMax)" m11

# M12: Success check uses resolveTarget.min instead of .max
m12() {
  sed -i 's/const successTarget = resolveTarget(/const successTarget = resolveTarget(/; s/}).max;$/}).min;/' "$PROG"
}
test_mutant "Success check uses resolveTarget.min (not .max)" m12

# M13: Success check uses successTarget - 1 (off-by-one)
m13() {
  sed -i 's/const hitTopOfRange = working\.every((set) => (valueOf(set) ?? 0) >= successTarget);/const hitTopOfRange = working.every((set) => (valueOf(set) ?? 0) >= successTarget - 1);/' "$PROG"
}
test_mutant "Success check uses successTarget - 1 (off-by-one)" m13

# M14: Success check uses repsMax (old plan-max judge)
m14() {
  perl -i -p0e 's/const successTarget = resolveTarget\(\{[^\}]+\}\)\.max;/const successTarget = repsMax;/s' "$PROG"
}
test_mutant "Success check uses repsMax (old plan-max judge)" m14

# M15: Success check uses Math.min(successTarget, repsMax)
m15() {
  perl -i -p0e 's/(const successTarget = )(resolveTarget\(\{[^\}]+\}\)\.max);/\1Math.min(\2, repsMax);/s' "$PROG"
}
test_mutant "Success check uses Math.min(successTarget, repsMax)" m15

# M16: Replace ex with {...ex, equipment_ids: []} in actions.ts
m16() {
  sed -i '/buildApplyProgressionInput(/,/feel,$/{s/    ex,$/    { ...ex, equipment_ids: [] },/}' "$ACTIONS"
}
test_mutant "Replace input equipment_ids with [] (actions.ts wiring)" m16 "ACTIONS"

# M17a: Drop equipment_ids in buildApplyProgressionInput
m17a() {
  sed -i 's/equipment_ids: exercise\.equipment_ids,/equipment_ids: [],/' "$CORE"
}
test_mutant "Drop equipment_ids in buildApplyProgressionInput" m17a "CORE"

# M17b: Pass empty equipment_ids with comment in apply-progression-core.ts
m17b() {
  sed -i 's/\.\.\.progressionInputsFromExercise(ex, userUnits)/\/\/ ...progressionInputsFromExercise(ex, userUnits)\n    ...progressionInputsFromExercise({ ...ex, equipment_ids: [] }, userUnits)/' "$CORE"
}
test_mutant "Pass empty equipment_ids in core (comment keeps text)" m17b "CORE"

# M18: Drop progInputs.equipmentIds in build-runner-exercises.ts
m18() {
  sed -i 's/progInputs\.equipmentIds,/\/\/ progInputs.equipmentIds,\n    [],/' "$BUILDER"
}
test_mutant "Drop progInputs.equipmentIds in buildRunnerExercise" m18 "BUILDER"

# M19: Drop userUnits in buildApplyProgressionInput
m19() {
  sed -i 's/    userUnits,$/    userUnits: null,/' "$CORE"
}
test_mutant "Drop userUnits in buildApplyProgressionInput" m19 "CORE"

echo
echo "==================================="
echo "Killed $KILLED | Survived $SURVIVED | Skipped $SKIPPED"
echo

if [ "$SURVIVED" -gt 0 ] || [ "$SKIPPED" -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
fi

if [ "$KILLED" -ne 20 ]; then
  echo "❌ FAILED: Expected 20 killed, got $KILLED"
  exit 1
fi

echo "✅ PASSED: All 20 mutants killed"
exit 0
