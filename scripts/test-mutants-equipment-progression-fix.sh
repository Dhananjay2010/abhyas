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
  "npm run test:msg-bodyweight-zero"
  "npm run test:med3-third-miss"
  "npm run test:barbell-grid-snap"
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

# A2: Remove equipment/unit spread (provide wrong defaults)
a2() {
  local file="$BUILD_INPUT"
  local search='...progressionInputsFromExercise(ex),'
  local replace='equipmentIds: undefined,'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/$search/$replace/" "$file"
}
test_mutant "Remove ...progressionInputsFromExercise" a2

# M1a: Back-off from current instead of pre-miss weight
m1a() {
  local file="$PROG"
  local search='const weightToBackOffFrom = state.weightAtFailureStartKg ?? currentWeight;'
  local replace='const weightToBackOffFrom = currentWeight;'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/const weightToBackOffFrom = state\\.weightAtFailureStartKg ?? currentWeight;/$replace/" "$file"
}
test_mutant "M1a: back-off from current (not pre-miss)" m1a

# M1b: Snap UP instead of DOWN
m1b() {
  local file="$PROG"
  local search='const snapped = Math.floor(rawReduced / roundingGrid) * roundingGrid;'
  local replace='const snapped = Math.ceil(rawReduced / roundingGrid) * roundingGrid;'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/Math\\.floor/Math.ceil/" "$file"
}
test_mutant "M1b: snap UP instead of DOWN" m1b

# M1c: Remove hold when reduced === weightToBackOffFrom (allow back-off to exceed current)
m1c() {
  local file="$PROG"
  local count
  count=$(grep -Fc 'if (reduced === weightToBackOffFrom) {' "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: hold pattern found $count times (expected 1)" >&2
    return 1
  fi
  # Replace the entire if block that holds when reduced === weightToBackOffFrom
  perl -0pi -e 's/\/\/ If helper returned same weight.*?if \(reduced === weightToBackOffFrom\) \{.*?return \{[^}]+outcome: "hold",[^}]+\};\s*\}/\/\/ MUTANT: hold removed/s' "$file"
  if cmp -s "$file" "$BACKUP_PROG"; then
    echo "ERROR: M1c did not change the file" >&2
    return 1
  fi
}
test_mutant "M1c: no hold when back-off unchanged" m1c

# C1: One-step cap removed (allow multi-step)
c1() {
  local file="$PROG"
  local search='const nextGrid = Math.ceil((from + epsilon) / gridStep) * gridStep;'
  local replace='const nextGrid = from + 2 * gridStep;'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/const nextGrid = Math\\.ceil((from + epsilon) \\/ gridStep) \\* gridStep;/$replace/" "$file"
}
test_mutant "One-step cap removed" c1

# C2: Success check ignores stored target (mutates the successTarget resolveTarget call only)
c2() {
  local file="$PROG"
  local count
  count=$(grep -Fc 'const successTarget = resolveTarget({' "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: successTarget pattern found $count times (expected 1)" >&2
    return 1
  fi
  perl -0pi -e 's/(const successTarget = resolveTarget\(\{[^}]*?)currentTargetReps: state\.currentTargetReps,/$1currentTargetReps: null,/s' "$file"
  if cmp -s "$file" "$BACKUP_PROG"; then
    echo "ERROR: C2 did not change the file" >&2
    return 1
  fi
}
test_mutant "Success check ignores stored target" c2

# C3: Remove Rule 2 clamp only (the twoMissFloor hold), leaving Rule 1 and nextWeight intact
c3() {
  local file="$PROG"
  local count
  count=$(grep -Fc "const twoMissFloor = computeTwoMissResult(currentWeight, false);" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Rule 2 pattern found $count times (expected 1)" >&2
    return 1
  fi
  perl -0pi -e "s/(const twoMissFloor = computeTwoMissResult\(currentWeight, false\);.*?if \(candidateWeight < twoMissFloor\) \{\n\s*)candidateWeight = currentWeight;\n(\s*)holdReason = 'twomiss';/\$1\/\/ MUTANT: Rule 2 hold removed\n\$2void 0;/s" "$file"
  if cmp -s "$file" "$BACKUP_PROG"; then
    echo "ERROR: C3 did not change the file" >&2
    return 1
  fi
}
test_mutant "Remove Rule 2 clamp" c3

# C4: Disable Rule 1 (20% threshold)
c4() {
  local file="$PROG"
  local search='if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {'
  local replace='if (cutFraction > 1.0) {'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {/$replace/" "$file"
}
test_mutant "Disable Rule 1 (20% threshold)" c4

# U1: actions.ts doesn't pass applyProgression to finishExerciseCore
u1() {
  local file="$ACTIONS"
  local search='{ applyProgression }'
  local replace='{ applyProgression: async () => null }'
  local count=$(grep -c "$search" "$file" || true)
  if [ "$count" -lt 1 ]; then
    echo "ERROR: Pattern '$search' not found" >&2
    return 1
  fi
  sed -i "s/{ applyProgression }/$replace/" "$file"
}
test_mutant "U1: applyProgression not passed" u1

# C4-bodyweight: isBodyweight always false
c4_bodyweight() {
  local file="$BUILD_INPUT"
  local search='isBodyweight: (ex.equipment_ids ?? []).length === 0,'
  local replace='isBodyweight: false,'
  local count=$(grep -Fc "isBodyweight: (ex.equipment_ids ?? []).length === 0," "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/isBodyweight: (ex\\.equipment_ids ?? \\[\\])\\.length === 0,/$replace/" "$file"
}
test_mutant "C4: isBodyweight always false" c4_bodyweight

# MSG: Remove bodyweight zero protection
msg() {
  local file="$PROG"
  local search='currentWeight === 0 || meta.isBodyweight'
  local replace='meta.isBodyweight'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/currentWeight === 0 || meta\\.isBodyweight/meta.isBodyweight/" "$file"
}
test_mutant "MSG: remove 'currentWeight === 0' check" msg

# SWAP: swap-prefill passes undefined instead of conditional equipmentIds  
swap_prefill() {
  local file="src/lib/session/swap-prefill.ts"
  # Current code: isBodyweight ? undefined : equipmentIds
  # Mutant: just undefined
  local count=$(grep -c 'isBodyweight ? undefined : equipmentIds' "$file" || true)
  if [ "$count" -ne 2 ]; then
    echo "ERROR: Pattern found $count times (expected 2)" >&2
    return 1
  fi
  sed -i 's/isBodyweight ? undefined : equipmentIds/undefined/g' "$file"
  if cmp -s "$file" "$BACKUP_SWAP"; then
    echo "ERROR: SWAP did not change the file" >&2
    return 1
  fi
}
test_mutant "SWAP: undefined equipmentIds in swap-prefill" swap_prefill

# BARBELL: incrementFor ignores equipmentIds (removes loadable check and grid logic)
barbell_grid() {
  local file="$PROG"
  # Check the signature exists
  local count=$(grep -Fc 'export function incrementFor(meta: ExerciseMeta, equipmentIds?: string[]): number {' "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: incrementFor signature not found ($count times)" >&2
    return 1
  fi
  # Remove the entire hasLoadable conditional block
  perl -0pi -e 's/(const mechanicIncrement[^;]+;\s*)\/\/ If equipment is specified and contains loadable equipment.*?return Math\.max\(mechanicIncrement, equipGrid\);\s*\}\s*\}/$1/s' "$file"
  if cmp -s "$file" "$BACKUP_PROG"; then
    echo "ERROR: BARBELL did not change the file" >&2
    return 1
  fi
}
test_mutant "BARBELL: incrementFor ignores equipment grid" barbell_grid

# MED-3: No third-miss step-down
med3() {
  local file="$PROG"
  # Look for the MED-3 block starting line
  local start_line=$(grep -n '// MED-3: Third+ consecutive miss' "$file" | cut -d: -f1)
  if [ -z "$start_line" ]; then
    echo "ERROR: MED-3 comment not found" >&2
    return 1
  fi
  # Remove lines 834-854 (the entire MED-3 block)
  sed -i '834,854d' "$file"
  # Add a comment at line 834
  sed -i '833a\    // MUTANT: MED-3 removed' "$file"
  if cmp -s "$file" "$BACKUP_PROG"; then
    echo "ERROR: MED-3 did not change the file" >&2
    return 1
  fi
}
test_mutant "MED-3: no third-miss step-down" med3

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
