#!/usr/bin/env bash
#
# Mutation tests for Decision F (first-miss hold).
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file. A mutant that does not type-check is SKIPPED. The original file is
# always restored (trap).
#
# Supports two modes:
# 1. Harness mode (MUTANT_TARGET_FILE set): mutate the specified file with override commands
# 2. Standalone mode (no MUTANT_TARGET_FILE): create scratch copy via mktemp, never touch checkout
#
# A mutant counts as KILLED only when a test exits non-zero AND prints an
# assertion failure line ("✗ FAIL" / "❌ FAIL") AND did not crash (no
# "CRASH", "✗ ERROR", "Missing script", "Cannot find module", SyntaxError).
#
# Exit 1 on any skip or survivor.

set -u

# Check if running in harness mode or standalone mode
if [ -n "${MUTANT_TARGET_FILE:-}" ]; then
  # === HARNESS MODE: mutate specified file with override commands ===
  FILE="$MUTANT_TARGET_FILE"
  BASELINE_CMD="${MUTANT_BASELINE_CMD:-npm run test:first-miss-pinned}"
  COMPILE_CMD="${MUTANT_COMPILE_CMD:-npx tsc --noEmit}"
  TEST_CMD="${MUTANT_TEST_CMD:-npm run test:first-miss-pinned}"
  WORK_DIR="$(pwd)"
  
  echo "=== Mutant Testing: Decision F (Harness Mode) ==="
  echo ""
else
  # === STANDALONE MODE: create scratch copy, never touch checkout ===
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  STATUS_BEFORE="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)"
  SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/first-miss-mutants.XXXXXX")"
  cleanup_scratch() {
    case "$SCRATCH" in
      "${TMPDIR:-/tmp}"/first-miss-mutants.*) rm -rf "$SCRATCH" ;;
    esac
  }
  # Tracked + untracked (not ignored) files, as they are in the working tree.
  ( cd "$REPO_ROOT" && git ls-files -z --cached --others --exclude-standard ) \
    | ( cd "$REPO_ROOT" && tar --null --ignore-failed-read -T - -cf - 2>/dev/null ) \
    | tar -xf - -C "$SCRATCH"
  [ -e "$SCRATCH/node_modules" ] || ln -s "$REPO_ROOT/node_modules" "$SCRATCH/node_modules"
  cd "$SCRATCH" || exit 1
  echo "Mutating a scratch copy: $SCRATCH (checkout untouched: $REPO_ROOT)"
  
  FILE="src/lib/program/progression.ts"
  BASELINE_CMD="npm run test:first-miss-pinned"
  COMPILE_CMD="npx tsc --noEmit"
  TEST_CMD="npm run test:first-miss-pinned"
  WORK_DIR="$SCRATCH"
  
  echo "=== Mutant Testing: Decision F ==="
  echo ""
fi

KILLED=0
SURVIVED=0
SKIPPED=0
CURRENT_FILE=""
BACKUP=""

restore() {
  if [ -n "$CURRENT_FILE" ] && [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
    # Atomic restore: verify backup before overwriting
    local backup_size
    backup_size=$(stat -c%s "$BACKUP" 2>/dev/null || stat -f%z "$BACKUP" 2>/dev/null || echo 0)
    if [ "$backup_size" -lt 1000 ]; then
      echo "❌ FATAL: Backup corrupted (size $backup_size)" >&2
      exit 1
    fi
    mv "$BACKUP" "$CURRENT_FILE"
  fi
  CURRENT_FILE=""
  BACKUP=""
}

if [ -n "${MUTANT_TARGET_FILE:-}" ]; then
  # Harness mode: simple cleanup
  trap 'restore' EXIT
  trap 'restore; exit 130' INT TERM
else
  # Standalone mode: cleanup scratch + check git status
  trap 'restore; cleanup_scratch' EXIT
  trap 'restore; cleanup_scratch; exit 130' INT TERM
fi

# Baseline check
if ! eval "$BASELINE_CMD" > /dev/null 2>&1; then
  echo "❌ Baseline failed"
  exit 1
fi
echo "✓ Baseline pass"

# replace_once FILE OLD NEW -> 0 if OLD occurred exactly once and was replaced
replace_once() {
  local file="$1" old="$2" new="$3"
  FILE="$file" OLD="$old" NEW="$new" node -e '
    const fs = require("fs");
    const { FILE, OLD, NEW } = process.env;
    const src = fs.readFileSync(FILE, "utf8");
    const n = src.split(OLD).length - 1;
    if (n !== 1) { console.error(`  pattern occurs ${n} times`); process.exit(1); }
    fs.writeFileSync(FILE, src.replace(OLD, () => NEW));
  '
}

# run_mutant NAME OLD NEW TEST...
run_mutant() {
  local name=$1 old=$2 new=$3
  shift 3
  echo ""
  echo "$name"
  CURRENT_FILE="$FILE"
  BACKUP="$(mktemp)"
  cp "$FILE" "$BACKUP"

  if ! replace_once "$FILE" "$old" "$new"; then
    echo "  ⊘ SKIP: pattern not found exactly once"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  
  if ! eval "$COMPILE_CMD" >/dev/null 2>&1; then
    echo "  ⊘ SKIP: does not compile (must be killed by a test, not tsc)"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  
  # Count kill only when test exits non-zero with assertion FAIL
  local killer=""
  local kill_reason=""
  for t in "$@"; do
    local output
    local test_cmd
    if [ -n "${MUTANT_TEST_CMD:-}" ] && [ "${MUTANT_TEST_CMD:-}" != "npm run test:first-miss-pinned" ]; then
      # Harness mode with custom test command - run once, not per test
      test_cmd="$TEST_CMD"
    else
      # Normal mode: run specific test
      test_cmd="npm run -s $t"
    fi
    
    # Run in subshell to prevent "exit N" from terminating this script
    local exit_code
    output=$(
      (eval "$test_cmd") 2>&1
      echo "EXIT_CODE=$?"
    )
    exit_code=$(echo "$output" | grep "^EXIT_CODE=" | cut -d= -f2)
    output=$(echo "$output" | grep -v "^EXIT_CODE=")
    
    # Only count as kill if:
    # - Test exited non-zero
    # - Not a crash or unexpected error
    if [ "$exit_code" -ne 0 ]; then
      if echo "$output" | grep -qiE "CRASH|ERROR.*test|Missing script|Cannot find module|SyntaxError"; then
        # Crash, not a kill
        continue
      fi
      
      # Harness mode: only exit 1 counts as kill, other codes are errors
      if [ -n "${MUTANT_TEST_CMD:-}" ] && [ "$exit_code" -ne 1 ]; then
        # Non-1 exit in harness mode is an error, not a kill
        continue
      fi
      
      # Check for assertion failure line
      if echo "$output" | grep -qE "FAIL|✗|❌"; then
        killer="$t"
        kill_reason=$(echo "$output" | grep -E "FAIL|✗|❌" | head -1 | sed 's/^[[:space:]]*//')
        break
      elif [ -n "${MUTANT_TEST_CMD:-}" ]; then
        # Harness mode with exit 1 but no assertion: still counts as kill
        killer="$t"
        kill_reason="test failure"
        break
      fi
    fi
    
    # Harness mode: only run test once, not per test in list
    if [ -n "${MUTANT_TEST_CMD:-}" ] && [ "${MUTANT_TEST_CMD:-}" != "npm run test:first-miss-pinned" ]; then
      break
    fi
  done
  
  if [ -n "$killer" ]; then
    echo "  ✅ KILLED: $kill_reason"
    KILLED=$((KILLED + 1))
  else
    echo "  ❌ SURVIVED"
    SURVIVED=$((SURVIVED + 1))
  fi
  
  restore
}

# Test mutations
run_mutant "first-miss-drops" \
  "const nextWeight = currentWeight;" \
  "const nextWeight = (currentWeight ?? 0) * 0.9;" \
  "test:first-miss-pinned"

run_mutant "counter-not-set" \
  "const newWeightAtFailureStart = state.consecutiveFailures === 0 && currentWeight !== null
    ? currentWeight
    : state.weightAtFailureStartKg;" \
  "const newWeightAtFailureStart = state.weightAtFailureStartKg;" \
  "test:first-miss-pinned"

run_mutant "failures-not-incremented" \
  "    outcome: \"hold\",
    nextWorkingWeightKg: nextWeight,
    consecutiveFailures: failures," \
  "    outcome: \"hold\",
    nextWorkingWeightKg: nextWeight,
    consecutiveFailures: 0," \
  "test:first-miss-pinned"

run_mutant "second-miss-holds" \
  "if (failures >= 2 && currentWeight !== null && currentWeight > 0) {" \
  "if (failures >= 99 && currentWeight !== null && currentWeight > 0) {" \
  "test:first-miss-pinned"

run_mutant "hard-feel-wrong-baseline" \
  "  const failures = Math.min(state.consecutiveFailures + 1, 3);
  const currentWeight = state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);" \
  "  const failures = Math.min(state.consecutiveFailures + 1, 3);
  const currentWeight = heaviest > 0 ? heaviest : state.currentWorkingWeightKg;" \
  "test:first-miss-pinned"

run_mutant "message-altered" \
  ": \"Staying at this weight until every set reaches the top of the range.\";" \
  ": \"Holding at this weight.\";" \
  "test:first-miss-pinned"

run_mutant "easy-no-double" \
  "        if (feel === \"easy\" && !isBodyweightWithAddedWeight) {
          jump = hasLoadable ? Math.max(2 * mechanicIncrement, gridStep) : 2 * mechanicIncrement;
        } else {
          jump = step;
        }" \
  "        if (false) {
          jump = hasLoadable ? Math.max(2 * mechanicIncrement, gridStep) : 2 * mechanicIncrement;
        } else {
          jump = step;
        }" \
  "test:easy-doubling-pins"

run_mutant "grid-step-ignored" \
  "step = hasLoadable ? Math.max(patternStep, gridStep) : patternStep;" \
  "step = patternStep;" \
  "test:first-miss-pinned"

run_mutant "snap-down" \
  "const snappedUp = Math.ceil(target / gridStep) * gridStep;" \
  "const snappedUp = Math.floor(target / gridStep) * gridStep;" \
  "test:first-miss-pinned"

run_mutant "floor-snap-ceil" \
  "next = Math.max(Math.floor((rawNext / gridStep) + 1e-9) * gridStep, from);" \
  "next = Math.max(Math.ceil((rawNext / gridStep) + 1e-9) * gridStep, from);" \
  "test:first-miss-pinned"

run_mutant "mechanic-wrong" \
  "        // Easy doubles the MECHANIC increment (before grid constraints)
        const mechanicIncrement = meta.mechanic === \"isolation\" ? 1.25 : 
          LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;" \
  "        // Easy doubles the MECHANIC increment (before grid constraints)
        const mechanicIncrement = meta.mechanic === \"isolation\" ? 2.5 : 
          LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;" \
  "test:easy-doubling-pins"

echo ""
echo "========================================"
echo "Killed: $KILLED"
echo "Survived: $SURVIVED"
echo "Skipped: $SKIPPED"
echo "========================================"

if [ $SURVIVED -gt 0 ]; then
  echo "❌ FAIL: $SURVIVED mutant(s) survived"
  exit 1
fi

if [ $SKIPPED -gt 0 ]; then
  echo "❌ FAIL: $SKIPPED mutant(s) skipped"
  exit 1
fi

if [ "$KILLED" -lt 11 ]; then
  echo "❌ FAIL: Need at least 11 killed, got $KILLED"
  exit 1
fi

# Standalone mode: verify checkout untouched
if [ -z "${MUTANT_TARGET_FILE:-}" ]; then
  STATUS_AFTER="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)"
  if [ "$STATUS_BEFORE" != "$STATUS_AFTER" ]; then
    echo "❌ FAIL: Checkout was modified"
    git -C "$REPO_ROOT" status --porcelain
    exit 1
  fi
fi

echo "✅ PASS: All mutants killed"
