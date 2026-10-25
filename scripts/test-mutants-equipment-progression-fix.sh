#!/usr/bin/env bash
# Mutation testing for equipment progression fix
# Validates: Rule 2 clamp, one-step increase cap, hold reasons, two-miss RAW 90% cap, mode weight, timed success

set -euo pipefail

PROG="src/lib/program/progression.ts"
BACKUP=$(mktemp /tmp/prog-backup.XXXXXX.ts)

cp "$PROG" "$BACKUP"
[ -s "$BACKUP" ] || exit 1

COUNT=0
KILLED=0
SURVIVED=0
SKIPPED=0

restore() {
  [ -f "$BACKUP" ] && cp "$BACKUP" "$PROG"
}

cleanup() {
  restore
  rm -f "$BACKUP"
}

trap cleanup EXIT
trap 'cleanup; exit 1' INT TERM

echo "✓ Backup created"
echo

TESTS=(
  "npm run test:first-miss-pinned"
  "npm run test:first-miss-two-miss-invariant"
  "npm run test:increase-cap"
  "npm run test:message-weight-consistency"
  "npm run test:kettlebell-success"
  "npm run test:timed-hold-message"
  "npm run test:undo-consistency"
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
  
  COUNT=$((COUNT + 1))
  printf "%-75s " "[$COUNT] $name"
  
  restore
  
  if ! $fn 2>/dev/null; then
    echo "⚠️  SKIP (mutation failed)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  if ! cmp -s "$PROG" "$BACKUP"; then
    # Changed - good
    :
  else
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
  if ! cmp -s "$PROG" "$BACKUP"; then
    echo "❌ ERROR: restore failed"
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

# M9: Timed success vs repsMax only (ignore currentTargetReps)
m9() {
  sed -i 's/const target = heaviest === 0 ? (state\.currentTargetReps ?? repsMax) : repsMax;/const target = repsMax;/' "$PROG"
}
test_mutant "Timed success vs repsMax only (ignore currentTargetReps)" m9

echo
echo "==================================="
echo "Killed $KILLED | Survived $SURVIVED | Skipped $SKIPPED"
echo

if [ "$SURVIVED" -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived"
  exit 1
else
  echo "✅ PASSED: $KILLED killed, $SKIPPED skipped (0 survived)"
  exit 0
fi
