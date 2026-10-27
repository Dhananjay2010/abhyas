#!/usr/bin/env bash
set -euo pipefail

# Mutant test for Decision F with proper mutation handling
FILE="${MUTANT_TARGET_FILE:-src/lib/program/progression.ts}"
BASELINE_CMD="${MUTANT_BASELINE_CMD:-npm run test:first-miss-pinned}"
COMPILE_CMD="${MUTANT_COMPILE_CMD:-npx tsc --noEmit}"
MUTANT_TEST_CMD="${MUTANT_TEST_CMD:-npm run test:first-miss-pinned && npm run test:never-below-lifted && npm run test:easy-doubling-pins}"

# Shared isCrash function
isCrash() {
  local exit_code=$1
  # Exit codes indicating runtime crash (not test failure):
  # 134: SIGABRT, 137: SIGKILL, 139: SIGSEGV
  if [ "$exit_code" -eq 134 ] || [ "$exit_code" -eq 137 ] || [ "$exit_code" -eq 139 ]; then
    return 0
  fi
  return 1
}

BACKUP=$(mktemp)
if [ ! -f "$BACKUP" ]; then
  echo "❌ ERROR: Failed to create backup" >&2
  exit 1
fi

cp "$FILE" "$BACKUP"

if [ ! -s "$BACKUP" ]; then
  echo "❌ ERROR: Backup is empty" >&2
  rm -f "$BACKUP"
  exit 1
fi

ORIG_SHA=$(sha256sum "$BACKUP" | cut -d' ' -f1)

restore_from_backup() {
  local backup_size
  backup_size=$(stat -c%s "$BACKUP" 2>/dev/null || stat -f%z "$BACKUP" 2>/dev/null || echo 0)
  
  if [ "$backup_size" -lt 1000 ]; then
    echo "❌ FATAL: Backup corrupted (size $backup_size)" >&2
    exit 1
  fi
  
  local backup_sha
  backup_sha=$(sha256sum "$BACKUP" 2>/dev/null | cut -d' ' -f1)
  if [ "$backup_sha" != "$ORIG_SHA" ]; then
    echo "❌ FATAL: Backup corrupted (SHA mismatch)" >&2
    exit 1
  fi
  
  cp "$BACKUP" "$FILE"
}

cleanup() {
  restore_from_backup
  rm -f "$BACKUP"
}
trap cleanup EXIT

echo "=== Mutant Testing: Decision F ==="
echo

# Baseline
if ! eval "$BASELINE_CMD" > /dev/null 2>&1; then
  echo "❌ Baseline failed"
  exit 1
fi
echo "✓ Baseline pass"

KILLED=0
SURVIVORS=()
SKIPPED=()

# Node-based exact-match replacer
mutate_exact() {
  local old="$1"
  local new="$2"
  
  node scripts/mutate-helper.js "$FILE" "$old" "$new"
}

test_mutant() {
  local name="$1"
  local old="$2"
  local new="$3"
  
  echo "Testing: $name"
  
  # Apply mutation
  if ! mutate_exact "$old" "$new" 2>/dev/null; then
    echo "  ⊘ SKIP: Pattern not found or ambiguous"
    SKIPPED+=("$name")
    return
  fi
  
  # Verify file changed
  local mutated_sha
  mutated_sha=$(sha256sum "$FILE" 2>/dev/null | cut -d' ' -f1)
  if [ "$mutated_sha" = "$ORIG_SHA" ]; then
    echo "  ⊘ SKIP: File unchanged"
    SKIPPED+=("$name")
    restore_from_backup
    return
  fi
  
  # Compile check
  local compile_exit=0
  eval "$COMPILE_CMD" > /dev/null 2>&1 || compile_exit=$?
  
  if [ $compile_exit -ne 0 ]; then
    if isCrash $compile_exit; then
      echo "  ⊘ SKIP: Compile crashed"
      SKIPPED+=("$name")
    else
      echo "  ⊘ SKIP: Does not compile"
      SKIPPED+=("$name")
    fi
    restore_from_backup
    return
  fi
  
  # Run tests
  local test_exit=0
  eval "$MUTANT_TEST_CMD" > /dev/null 2>&1 || test_exit=$?
  
  if [ $test_exit -eq 0 ]; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
  elif isCrash $test_exit; then
    echo "  ⊘ SKIP: Test crashed"
    SKIPPED+=("$name")
  else
    echo "  ✅ KILLED"
    KILLED=$((KILLED + 1))
  fi
  
  restore_from_backup
}

# Test mutations
test_mutant "first-miss-drops" \
  "const nextWeight = currentWeight;" \
  "const nextWeight = (currentWeight ?? 0) * 0.9;"

test_mutant "counter-not-set" \
  "const newWeightAtFailureStart = state.consecutiveFailures === 0 && currentWeight !== null
    ? currentWeight
    : state.weightAtFailureStartKg;" \
  "const newWeightAtFailureStart = state.weightAtFailureStartKg;"

test_mutant "failures-not-incremented" \
  "    outcome: \"hold\",
    nextWorkingWeightKg: nextWeight,
    consecutiveFailures: failures," \
  "    outcome: \"hold\",
    nextWorkingWeightKg: nextWeight,
    consecutiveFailures: 0,"

test_mutant "second-miss-holds" \
  "if (failures >= 2 && currentWeight !== null && currentWeight > 0) {" \
  "if (failures >= 99 && currentWeight !== null && currentWeight > 0) {"

test_mutant "hard-feel-wrong-baseline" \
  "  const failures = Math.min(state.consecutiveFailures + 1, 3);
  const currentWeight = state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);" \
  "  const failures = Math.min(state.consecutiveFailures + 1, 3);
  const currentWeight = mode > 0 ? mode : (state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null));"

test_mutant "message-altered" \
  ": \"Staying at this weight until every set reaches the top of the range.\";" \
  ": \"Holding at this weight.\";"

test_mutant "easy-no-double" \
  "        if (feel === \"easy\" && !isBodyweightWithAddedWeight) {
          jump = hasLoadable ? Math.max(2 * mechanicIncrement, gridStep) : 2 * mechanicIncrement;
        } else {
          jump = step;
        }" \
  "        if (false) {
          jump = hasLoadable ? Math.max(2 * mechanicIncrement, gridStep) : 2 * mechanicIncrement;
        } else {
          jump = step;
        }"

test_mutant "grid-step-ignored" \
  "step = hasLoadable ? Math.max(patternStep, gridStep) : patternStep;" \
  "step = patternStep;"

test_mutant "snap-down" \
  "const snappedUp = Math.ceil(target / gridStep) * gridStep;" \
  "const snappedUp = Math.floor(target / gridStep) * gridStep;"

test_mutant "floor-snap-ceil" \
  "next = Math.max(Math.floor((rawNext / gridStep) + 1e-9) * gridStep, from);" \
  "next = Math.max(Math.ceil((rawNext / gridStep) + 1e-9) * gridStep, from);"

test_mutant "mechanic-wrong" \
  "        // Easy doubles the MECHANIC increment (before grid constraints)
        const mechanicIncrement = meta.mechanic === \"isolation\" ? 1.25 : 
          LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;" \
  "        // Easy doubles the MECHANIC increment (before grid constraints)
        const mechanicIncrement = meta.mechanic === \"isolation\" ? 2.5 : 
          LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;"

echo
echo "========================================"
echo "Killed: $KILLED"
echo "Survived: ${#SURVIVORS[@]}"
echo "Skipped: ${#SKIPPED[@]}"
echo "========================================"

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "Survivors: ${SURVIVORS[*]}"
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "Skipped: ${SKIPPED[*]}"
fi

if [ "$KILLED" -lt 10 ]; then
  echo "❌ FAIL: Need at least 10 killed, got $KILLED"
  exit 1
fi

if [ ${#SURVIVORS[@]} -gt 0 ] || [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "❌ FAIL: ${#SURVIVORS[@]} survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

echo "✅ PASS: All mutants killed"
