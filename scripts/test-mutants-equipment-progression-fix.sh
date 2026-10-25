#!/usr/bin/env bash
# Mutation testing for equipment progression fix
# Validates: wiring mutants, resolveTarget, equipment/unit spread, unit choice, units fetch

set -euo pipefail

PROG="src/lib/program/progression.ts"
ACTIONS="src/app/session/actions.ts"
BUILD_INPUT="src/lib/session/build-progression-input.ts"
BUILD_RUNNER="src/lib/session/build-runner-exercises.ts"
PROG_INPUTS="src/lib/session/progression-inputs.ts"

BACKUP_PROG=$(mktemp /tmp/prog-backup.XXXXXX.ts)
BACKUP_ACTIONS=$(mktemp /tmp/actions-backup.XXXXXX.ts)
BACKUP_BUILD_INPUT=$(mktemp /tmp/build-input-backup.XXXXXX.ts)
BACKUP_BUILD_RUNNER=$(mktemp /tmp/build-runner-backup.XXXXXX.ts)
BACKUP_PROG_INPUTS=$(mktemp /tmp/prog-inputs-backup.XXXXXX.ts)

cp "$PROG" "$BACKUP_PROG"
cp "$ACTIONS" "$BACKUP_ACTIONS"
cp "$BUILD_INPUT" "$BACKUP_BUILD_INPUT"
cp "$BUILD_RUNNER" "$BACKUP_BUILD_RUNNER"
cp "$PROG_INPUTS" "$BACKUP_PROG_INPUTS"

COUNT=0
KILLED=0
SURVIVED=0
SKIPPED=0

restore() {
  cp "$BACKUP_PROG" "$PROG"
  cp "$BACKUP_ACTIONS" "$ACTIONS"
  cp "$BACKUP_BUILD_INPUT" "$BUILD_INPUT"
  cp "$BACKUP_BUILD_RUNNER" "$BUILD_RUNNER"
  cp "$BACKUP_PROG_INPUTS" "$PROG_INPUTS"
}

cleanup() {
  restore
  rm -f "$BACKUP_PROG" "$BACKUP_ACTIONS" "$BACKUP_BUILD_INPUT" "$BACKUP_BUILD_RUNNER" "$BACKUP_PROG_INPUTS"
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
  "npm run test:progression-display-target-consistency"
  "npm run test:progression-display-consistency"
  "npm run test:qa-bot-1-full-path"
  "npm run test:call-site-wiring"
  "npm run test:progression-real-path"
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
  printf "[%2d] %-70s " "$COUNT" "$name"
  
  restore
  
  if ! $fn 2>/dev/null; then
    echo "⚠️  SKIP (pattern failed)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  # Compile check
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "⚠️  SKIP (does not compile)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  # Run tests
  local fail=0
  for t in "${TESTS[@]}"; do
    if ! $t > /dev/null 2>&1; then
      fail=1
      break
    fi
  done
  
  restore
  
  if [ "$fail" -eq 0 ]; then
    echo "❌ SURVIVED"
    SURVIVED=$((SURVIVED + 1))
  else
    echo "✅ KILLED"
    KILLED=$((KILLED + 1))
  fi
}

# Wiring mutants (target real code)

# A1: resolveTarget minimum reverted to plan min
a1() {
  local file="$BUILD_INPUT"
  local search="repsMin: resolvedMin,"
  local replace="repsMin: sessionExercise.planned_reps_min ?? 8,"
  local count=$(grep -c "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern '$search' found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/$search/$replace/" "$file"
}
test_mutant "resolveTarget min → plan min" a1

# A2: Remove equipment/unit spread
a2() {
  local file="$BUILD_INPUT"
  local search='\.\.\.progressionInputsFromExercise(ex, userUnits),'
  local count=$(grep -c "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "/$search/d" "$file"
}
test_mutant "Remove ...progressionInputsFromExercise" a2

# B1: Unit choice hardcoded to kg
b1() {
  local file="$PROG_INPUTS"
  local search='userUnits === "imperial" ? "lb" : "kg"'
  local replace='"kg"'
  local count=$(grep -c "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/$search/$replace/g" "$file"
}
test_mutant "Unit choice → always kg" b1

# B2: actions.ts units fetch → undefined
b2() {
  local file="$ACTIONS"
  local search='profileRes\.data\?\.units'
  local replace='undefined'
  local count=$(grep -c "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/$search/$replace/" "$file"
}
test_mutant "actions.ts units → undefined" b2

# C1: One-step cap removed (allow multi-step)
c1() {
  local file="$PROG"
  local search='const nextGrid = Math\.ceil\((from \+ epsilon) \/ gridStep\) \* gridStep;'
  local replace='const nextGrid = from + 2 * gridStep;'
  local count=$(grep -c "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/$search/$replace/" "$file"
}
test_mutant "One-step cap removed" c1

# C2: Success check ignores stored target
c2() {
  local file="$PROG"
  local pattern='currentTargetReps: state\.currentTargetReps,'
  # Count in resolveTarget calls only (success check context)
  local count=$(grep -n "$pattern" "$file" | grep -c "resolveTarget" || true)
  if [ "$count" -eq 0 ]; then
    # Try without grep context
    count=$(grep -c "$pattern" "$file" || true)
    if [ "$count" -ne 2 ]; then
      echo "ERROR: Pattern found $count times (expected 2)" >&2
      return 1
    fi
  fi
  sed -i "0,/$pattern/{s/$pattern/currentTargetReps: null,/}" "$file"
}
test_mutant "Success check ignores stored target" c2

# C3: Remove Rule 2 clamp
c3() {
  local file="$PROG"
  local pattern='if (candidateWeight !== currentWeight) {\s*const twoMissFloor'
  # Multi-line: find the block and comment it
  sed -i '/if (candidateWeight !== currentWeight) {/{N;/const twoMissFloor/s/^/\/\/ MUTANT: /;s/\n/\n\/\/ MUTANT: /g;}' "$file"
}
test_mutant "Remove Rule 2 clamp" c3

# C4: Disable Rule 1 (20% threshold)
c4() {
  local file="$PROG"
  local search='if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {'
  local replace='if (cutFraction > 1.0) {'
  local count=$(grep -c "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/$search/$replace/" "$file"
}
test_mutant "Disable Rule 1 (20% threshold)" c4

echo
echo "==========================================="
echo "Mutant Test Summary"
echo "==========================================="
echo "Total mutants:                   $COUNT"
echo "Killed:                          $KILLED"
echo "Survived:                        $SURVIVED"
echo "Skipped:                         $SKIPPED"
echo "==========================================="
echo

if [ "$SURVIVED" -gt 0 ] || [ "$SKIPPED" -gt 0 ]; then
  echo "❌ FAIL: $SURVIVED survivor(s), $SKIPPED skip(s)"
  exit 1
else
  echo "✅ PASS: All mutants killed"
  exit 0
fi
