#!/usr/bin/env bash
# Mutation testing for equipment progression fix
# Validates: wiring mutants, resolveTarget, equipment/unit spread, unit choice, units fetch

set -euo pipefail

PROG="src/lib/program/progression.ts"
ACTIONS="src/app/session/actions.ts"
BUILD_INPUT="src/lib/session/build-progression-input.ts"
BUILD_RUNNER="src/lib/session/build-runner-exercises.ts"
PROG_INPUTS="src/lib/session/progression-inputs.ts"
SWAP_PREFILL="src/lib/session/swap-prefill.ts"
FEEDBACK="src/lib/session/progression-feedback.ts"

BACKUP_PROG=$(mktemp /tmp/prog-backup.XXXXXX.ts)
BACKUP_ACTIONS=$(mktemp /tmp/actions-backup.XXXXXX.ts)
BACKUP_BUILD_INPUT=$(mktemp /tmp/build-input-backup.XXXXXX.ts)
BACKUP_BUILD_RUNNER=$(mktemp /tmp/build-runner-backup.XXXXXX.ts)
BACKUP_PROG_INPUTS=$(mktemp /tmp/prog-inputs-backup.XXXXXX.ts)
BACKUP_SWAP=$(mktemp /tmp/swap-backup.XXXXXX.ts)
BACKUP_FEEDBACK=$(mktemp /tmp/feedback-backup.XXXXXX.ts)

cp "$PROG" "$BACKUP_PROG"
cp "$ACTIONS" "$BACKUP_ACTIONS"
cp "$BUILD_INPUT" "$BACKUP_BUILD_INPUT"
cp "$BUILD_RUNNER" "$BACKUP_BUILD_RUNNER"
cp "$PROG_INPUTS" "$BACKUP_PROG_INPUTS"
cp "$SWAP_PREFILL" "$BACKUP_SWAP"
cp "$FEEDBACK" "$BACKUP_FEEDBACK"

COUNT=0
KILLED=0
SURVIVED=0
SKIPPED=0
crashed=0

restore() {
  cp "$BACKUP_PROG" "$PROG"
  cp "$BACKUP_ACTIONS" "$ACTIONS"
  cp "$BACKUP_BUILD_INPUT" "$BUILD_INPUT"
  cp "$BACKUP_BUILD_RUNNER" "$BUILD_RUNNER"
  cp "$BACKUP_PROG_INPUTS" "$PROG_INPUTS"
  cp "$BACKUP_SWAP" "$SWAP_PREFILL"
  cp "$BACKUP_FEEDBACK" "$FEEDBACK"
}

cleanup() {
  restore
  rm -f "$BACKUP_PROG" "$BACKUP_ACTIONS" "$BACKUP_BUILD_INPUT" "$BACKUP_BUILD_RUNNER" "$BACKUP_PROG_INPUTS" "$BACKUP_SWAP" "$BACKUP_FEEDBACK"
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
  "npm run test:swap-prefill-equipmentids"
  "npm run test:m1-null-premiss-fallback"
  "npm run test:third-miss-step-down"
  "npm run test:imperial-units-full-path"
  "npm run test:actions-imperial-behavioral-l4b4"
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
  
  # Run tests and capture output
  local fail=0
  local test_output=""
  for t in "${TESTS[@]}"; do
    test_output=$($t 2>&1) || fail=1
    if [ "$fail" -eq 1 ]; then
      # Distinguish crash (uncaught exception) from assertion kill
      # KILLED = test printed assertion failure marker AND no uncaught exception stack
      # CRASHED = anything else (uncaught exception, process.exit, throw "string", etc.)
      
      # Check for assertion failure markers: "  FAIL ", "FAILED:", "❌ FAIL:", or "AssertionError"
      local has_assertion_fail=0
      if echo "$test_output" | grep -qE '(  FAIL |FAILED:|❌ FAIL:|AssertionError)'; then
        has_assertion_fail=1
      fi
      
      # Check for uncaught exception indicators:
      # - Stack trace lines: "    at ..."
      # - Node.js crash patterns: "triggerUncaughtException", "node:internal"
      # - Empty output (process.exit with no output)
      local has_crash_indicator=0
      if echo "$test_output" | grep -qE '(^\s+at |triggerUncaughtException|node:internal)'; then
        has_crash_indicator=1
      elif [ -z "$test_output" ]; then
        # Empty output = silent crash (process.exit or similar)
        has_crash_indicator=1
      fi
      
      # KILLED only if: has assertion marker AND no crash indicators
      if [ "$has_assertion_fail" -eq 1 ] && [ "$has_crash_indicator" -eq 0 ]; then
        # Clean assertion failure = killed
        echo "✅ KILLED"
        restore
        KILLED=$((KILLED + 1))
        return
      else
        # Uncaught exception, silent exit, or no assertion marker = crashed
        echo "💥 CRASHED"
        restore
        crashed=$((crashed + 1))
        return
      fi
    fi
  done
  
  restore
  
  if [ "$fail" -eq 0 ]; then
    echo "❌ SURVIVED"
    SURVIVED=$((SURVIVED + 1))
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

# A2: Remove equipment spread (make progressionInputsFromExercise always return empty)
a2() {
  local file="$PROG_INPUTS"
  # Make the function always return empty object
  local search='return {'
  local count=$(grep -c "$search" "$file" || true)
  if [ "$count" -lt 1 ]; then
    echo "ERROR: Pattern found $count times (expected >= 1)" >&2
    return 1
  fi
  # Replace all return statements to return empty object
  sed -i 's|return {|return { /* MUTANT: always empty */ } as any; return {|' "$file"
  if cmp -s "$file" "$BACKUP_PROG_INPUTS"; then
    echo "ERROR: A2 did not change the file" >&2
    return 1
  fi
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
  # Use perl for reliable replacement
  perl -i -pe 's/const snapped = Math\.floor\(rawReduced \/ roundingGrid\) \* roundingGrid;/const snapped = Math.ceil(rawReduced \/ roundingGrid) * roundingGrid;/' "$file"
  if ! grep -q "const snapped = Math.ceil" "$file"; then
    echo "ERROR: M1b mutation did not apply" >&2
    return 1
  fi
}
test_mutant "M1b: snap UP instead of DOWN" m1b

# M1c: Remove hold when reduced === currentWeight
m1c() {
  local file="$PROG"
  sed -i 's/if (reduced === currentWeight) {/if (false \&\& reduced === currentWeight) {/' "$file"
  if ! grep -q 'if (false && reduced === currentWeight)' "$file"; then
    echo "ERROR: M1c mutation did not apply" >&2
    return 1
  fi
}
test_mutant "M1c: no hold when back-off unchanged" m1c

# C1: One-step cap removed (remove the snap-down step addition)
c1() {
  local file="$PROG"
  local search='next = snappedFrom + gridStep;'
  local replace='next = from;'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i "s/next = snappedFrom + gridStep;/next = from;/" "$file"
  if cmp -s "$file" "$BACKUP_PROG"; then
    echo "ERROR: C1 did not change the file" >&2
    return 1
  fi
}
test_mutant "One-step cap removed (no snap step)" c1

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
  count=$(grep -Fc "const twoMissFloor = computeTwoMissResult(currentWeight);" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Rule 2 pattern found $count times (expected 1)" >&2
    return 1
  fi
  perl -0pi -e "s/(const twoMissFloor = computeTwoMissResult\(currentWeight\);.*?if \(candidateWeight < twoMissFloor\) \{\n\s*)candidateWeight = currentWeight;\n(\s*)holdReason = 'twomiss';/\$1\/\/ MUTANT: Rule 2 hold removed\n\$2void 0;/s" "$file"
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
  local file="$SWAP_PREFILL"
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

# MED-3: No third-miss step-down (change failures >= 3 to failures >= 999)
med3() {
  local file="$PROG"
  # Change the condition to never trigger (but keep valid TypeScript)
  sed -i 's/if (failures >= 3 && reduced === currentWeight && equipmentIds) {/if (failures >= 999 \&\& reduced === currentWeight \&\& equipmentIds) {/' "$file"
  if ! grep -q 'failures >= 999' "$file"; then
    echo "ERROR: MED-3 mutation did not apply" >&2
    return 1
  fi
}
test_mutant "MED-3: no third-miss step-down" med3

# L4B-1: Use Math.round (nearest) instead of Math.floor (snap-down)
l4b_round_instead_floor() {
  local file="$PROG"
  local search='const snappedFrom = Math.floor(from / gridStep) * gridStep;'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  # Use | as delimiter
  sed -i 's|const snappedFrom = Math\.floor(from / gridStep) \* gridStep;|const snappedFrom = Math.round(from / gridStep) * gridStep;|' "$file"
  # Use grep -F for fixed string matching
  if ! grep -qF 'const snappedFrom = Math.round(from / gridStep) * gridStep;' "$file"; then
    echo "ERROR: L4B-1 mutation did not apply" >&2
    return 1
  fi
}
test_mutant "L4B-1: round to nearest instead of floor" l4b_round_instead_floor

# L4B-2: Remove the snap step (step from raw stored weight)
l4b_no_snap_step() {
  local file="$PROG"
  local count=$(grep -c 'const snappedFrom = Math\.floor(from / gridStep) \* gridStep;' "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  # Comment out the snap line, use from directly
  sed -i 's|const snappedFrom = Math\.floor(from / gridStep) \* gridStep;|// const snappedFrom = Math.floor(from / gridStep) * gridStep; // MUTANT|' "$file"
  sed -i 's|next = snappedFrom + Math\.max(gridStep, jump);|next = from + Math.max(gridStep, jump);|' "$file"
  if cmp -s "$file" "$BACKUP_PROG"; then
    echo "ERROR: L4B-2 did not change the file" >&2
    return 1
  fi
}
test_mutant "L4B-2: no snap, step from raw stored weight" l4b_no_snap_step

# CAP-1: Cap at gridStep only (not max(gridStep, increment))
cap_gridstep_only() {
  local file="$PROG"
  local search='next = snappedFrom + Math.max(gridStep, jump);'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern found $count times (expected 1)" >&2
    return 1
  fi
  sed -i 's|next = snappedFrom + Math\.max(gridStep, jump);|next = snappedFrom + gridStep;|' "$file"
  if ! grep -q 'next = snappedFrom + gridStep;' "$file"; then
    echo "ERROR: CAP-1 mutation did not apply" >&2
    return 1
  fi
}
test_mutant "CAP-1: cap at gridStep (not max(gridStep, increment))" cap_gridstep_only

# L4B-3: Drop equipmentIds (make progressionInputsFromExercise return empty)
l4b_drop_equipment() {
  local file="$PROG_INPUTS"
  # Make the function always return empty object (no equipmentIds)
  sed -i 's|equipmentIds: \[\.\.\.exercise\.equipment_ids\],|// MUTANT: equipmentIds dropped|' "$file"
  if cmp -s "$file" "$BACKUP_PROG_INPUTS"; then
    echo "ERROR: L4B-3 did not change the file" >&2
    return 1
  fi
}
test_mutant "L4B-3: drop equipmentIds from progression input" l4b_drop_equipment

# L4B-4: Hardcode units to metric in buildProgressionFeedbackForUser
l4b_drop_units() {
  local file="src/lib/session/progression-feedback.ts"
  # Mutate getProfileUnits call inside buildProgressionFeedbackForUser
  local search='getProfileUnits(supabase, userId),'
  local count=$(grep -Fc "$search" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: Pattern not found (found $count times)" >&2
    return 1
  fi
  # Replace with Promise.resolve("metric")
  sed -i "s|getProfileUnits(supabase, userId),|Promise.resolve<UnitsPreference>(\"metric\"),|" "$file"
  if ! grep -q 'Promise.resolve<UnitsPreference>("metric")' "$file"; then
    echo "ERROR: L4B-4 mutation did not apply" >&2
    return 1
  fi
}
test_mutant "L4B-4: drop units (hardcode getUnits to metric)" l4b_drop_units

echo
echo "==========================================="
echo "Mutant Test Summary"
echo "==========================================="
echo "Total mutants:                   $COUNT"
echo "Killed:                          $KILLED"
echo "Survived:                        $SURVIVED"
echo "Skipped:                         $SKIPPED"
echo "Crashed:                         $crashed"
echo "==========================================="
echo

if [ "$SURVIVED" -gt 0 ] || [ "$SKIPPED" -gt 0 ] || [ "$crashed" -gt 0 ]; then
  echo "❌ FAIL: $SURVIVED survivor(s), $SKIPPED skip(s), $crashed crash(es)"
  exit 1
else
  echo "✅ PASS: All mutants killed"
  exit 0
fi
