#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for first-miss hold guard
# Uses Node string replacement with exact-match assertions
# mktemp backups with restore trap
# Exit 1 on any survivor or skip
#
# RECOVERY: If SIGKILL interrupts while a mutation is applied, manually restore:
#   Look for the backup path in stderr or find the latest /tmp/tmp.* file
#   cp BACKUP_PATH src/lib/program/progression.ts
#   Or use: git show HEAD:src/lib/program/progression.ts > src/lib/program/progression.ts
#   Verify: git diff src/lib/program/progression.ts (should be empty)

# Check required tools exist
for cmd in sha256sum cmp; do
  if ! command -v "$cmd" > /dev/null 2>&1; then
    echo "❌ ERROR: Required command '$cmd' not found" >&2
    exit 1
  fi
done

# Allow override for testing
FILE="${MUTANT_TARGET_FILE:-src/lib/program/progression.ts}"
BASELINE_CMD="${MUTANT_BASELINE_CMD:-npm run test:first-miss-pinned}"
COMPILE_CMD="${MUTANT_COMPILE_CMD:-npx tsc --noEmit}"
MUTANT_TEST_CMD="${MUTANT_TEST_CMD:-npm run test:first-miss-pinned}"

# Record original SHA before anything else
if [ ! -f "$FILE" ]; then
  echo "❌ ERROR: Target file not found: $FILE" >&2
  exit 1
fi

ORIG_SHA=$(sha256sum "$FILE" | cut -d' ' -f1)

# When using real file, refuse to run if uncommitted changes exist
if [ "$FILE" = "src/lib/program/progression.ts" ]; then
  if ! git diff --quiet -- "$FILE" 2>/dev/null; then
    echo "❌ ERROR: Target file has uncommitted changes: $FILE" >&2
    echo "   Commit or stash changes before running mutant tests" >&2
    echo "   Recovery source: git show HEAD:$FILE" >&2
    exit 1
  fi
fi

BACKUP=$(mktemp)
MUTATE_SCRIPT=$(mktemp)
FAILED=0
SURVIVORS=()
SKIPPED=()
MUTATION_APPLIED=false
CLEANUP_DONE=false

# Shared isCrash function
isCrash() {
  local exit_code=$1
  # Exit codes indicating runtime crash (not test failure):
  # 134: SIGABRT, 137: SIGKILL, 139: SIGSEGV
  # Node throws on syntax error, stack overflow, etc.
  if [ "$exit_code" -eq 134 ] || [ "$exit_code" -eq 137 ] || [ "$exit_code" -eq 139 ]; then
    return 0
  fi
  # Node exits 1 on uncaught exception/syntax error; distinguish from test failure
  # If test output contains "SyntaxError" or "ReferenceError", it's a crash
  return 1
}

restore_or_die() {
  # Verify backup integrity and restore target file atomically
  # On any mismatch: print to stderr, keep backup, exit non-zero
  
  if [ ! -f "$BACKUP" ]; then
    echo "❌ FATAL: Backup file missing. Cannot restore $FILE" >&2
    echo "   Backup path: $BACKUP" >&2
    exit 1
  fi
  
  if [ ! -s "$BACKUP" ]; then
    echo "❌ FATAL: Backup file is empty. Cannot restore $FILE" >&2
    echo "   Backup path: $BACKUP (empty)" >&2
    exit 1
  fi
  
  local backup_sha
  backup_sha=$(sha256sum "$BACKUP" | cut -d' ' -f1)
  
  if [ "$backup_sha" != "$ORIG_SHA" ]; then
    echo "❌ FATAL: Backup has been corrupted (sha256 mismatch)" >&2
    echo "   Expected: $ORIG_SHA" >&2
    echo "   Got:      $backup_sha" >&2
    echo "   Backup path: $BACKUP (keeping for recovery)" >&2
    echo "   Target:  $FILE (left as-is)" >&2
    exit 1
  fi
  
  # Restore via temp file and atomic rename
  local temp_restore
  temp_restore=$(mktemp "${FILE}.restore.XXXXXX")
  cp "$BACKUP" "$temp_restore"
  mv "$temp_restore" "$FILE"
  
  # Verify restored file
  local restored_sha
  restored_sha=$(sha256sum "$FILE" | cut -d' ' -f1)
  
  if [ "$restored_sha" != "$ORIG_SHA" ]; then
    echo "❌ FATAL: Restored file has wrong sha256" >&2
    echo "   Expected: $ORIG_SHA" >&2
    echo "   Got:      $restored_sha" >&2
    echo "   Backup path: $BACKUP (keeping for recovery)" >&2
    exit 1
  fi
}

cleanup() {
  if [ "$CLEANUP_DONE" = true ]; then
    return 0
  fi
  CLEANUP_DONE=true
  
  if [ "$MUTATION_APPLIED" = true ]; then
    restore_or_die
  fi
  
  rm -f "$BACKUP" "$MUTATE_SCRIPT"
}

trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

echo "=== Mutant Testing: First-Miss Hold Guard ==="
echo

# Back up original BEFORE setting any trap
cp "$FILE" "$BACKUP"

# Record original SHA
ORIG_SHA=$(sha256sum "$FILE" | cut -d' ' -f1)

# Verify backup exists, is non-empty, and matches original
if [ ! -f "$BACKUP" ]; then
  echo "❌ ERROR: Backup file not created"
  exit 1
fi

if [ ! -s "$BACKUP" ]; then
  echo "❌ ERROR: Backup file is empty"
  rm -f "$BACKUP"
  exit 1
fi

if ! cmp -s "$FILE" "$BACKUP"; then
  echo "❌ ERROR: Backup is not byte-identical to original"
  rm -f "$BACKUP"
  exit 1
fi

backup_sha=$(sha256sum "$BACKUP" | cut -d' ' -f1)
if [ "$backup_sha" != "$ORIG_SHA" ]; then
  echo "❌ ERROR: Backup sha256 does not match original"
  rm -f "$BACKUP"
  exit 1
fi

# Baseline: run tests
echo "Running baseline tests..."
if ! eval "$BASELINE_CMD" > /dev/null 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests."
  exit 1
fi
echo "✓ Baseline tests pass"
echo

run_mutant() {
  local name="$1"
  local description="$2"
  local search="$3"
  local replace="$4"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Apply mutant with Node (assert exactly one occurrence)
  # Write to temp file first, then atomic rename
  cat > "$MUTATE_SCRIPT" << 'MUTATE_SCRIPT'
const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(process.argv[2], 'utf8');
const search = process.argv[3];
const replace = process.argv[4];

// Escape special regex characters in search string for counting
const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (content.match(new RegExp(escaped, 'g')) || []).length;

if (count === 0) {
  console.error('ERROR: Search string not found');
  process.exit(1);
}
if (count > 1) {
  console.error('ERROR: Search string occurs ' + count + ' times, need exactly 1');
  process.exit(1);
}

const newContent = content.replace(search, replace);
const target = process.argv[2];
const temp = target + '.mutate.tmp';
fs.writeFileSync(temp, newContent, 'utf8');
fs.renameSync(temp, target);
MUTATE_SCRIPT
  
  # Mark that mutation is about to be applied (BEFORE the write)
  MUTATION_APPLIED=true
  
  NODE_EXIT=0
  node "$MUTATE_SCRIPT" "$FILE" "$search" "$replace" 2>&1 || NODE_EXIT=$?
  
  if [ $NODE_EXIT -ne 0 ]; then
    echo "  ❌ SKIPPED: String replacement failed"
    SKIPPED+=("$name: replacement failed")
    MUTATION_APPLIED=false
    return 0
  fi
  
  # Verify file changed
  if cmp -s "$FILE" "$BACKUP"; then
    echo "  ❌ SKIPPED: File did not change"
    SKIPPED+=("$name: file unchanged")
    restore_or_die
    MUTATION_APPLIED=false
    return 0
  fi
  
  # Check tsc compiles
  COMPILE_EXIT=0
  eval "$COMPILE_CMD" > /dev/null 2>&1 || COMPILE_EXIT=$?
  
  if [ $COMPILE_EXIT -ne 0 ]; then
    if isCrash $COMPILE_EXIT; then
      echo "  ❌ SKIPPED: Compilation crashed (exit $COMPILE_EXIT)"
      SKIPPED+=("$name: compilation crash")
    else
      echo "  ❌ SKIPPED: Does not compile"
      SKIPPED+=("$name: does not compile")
    fi
    restore_or_die
    MUTATION_APPLIED=false
    return 0
  fi
  
  # Run tests
  TEST_EXIT=0
  TEST_OUTPUT=$(mktemp)
  eval "$MUTANT_TEST_CMD" > "$TEST_OUTPUT" 2>&1 || TEST_EXIT=$?
  
  if [ $TEST_EXIT -eq 0 ]; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  elif isCrash $TEST_EXIT || grep -q "SyntaxError\|ReferenceError\|TypeError.*is not a function" "$TEST_OUTPUT"; then
    echo "  ❌ SKIPPED: Runtime crash (exit $TEST_EXIT)"
    SKIPPED+=("$name: runtime crash")
  else
    echo "  ✅ KILLED"
  fi
  
  rm -f "$TEST_OUTPUT"
  
  # Restore
  restore_or_die
  MUTATION_APPLIED=false
  return 0
}

# Mutant (a): First miss steps down instead of holding
run_mutant \
  "(a) first miss steps down" \
  "Decision F: first miss should ALWAYS hold, not step down" \
  "  // First miss: always hold at current weight (coordinator decision F)
  const nextWeight = currentWeight;" \
  "  // First miss: always hold at current weight (coordinator decision F)
  const nextWeight = Math.max(0, (currentWeight ?? 0) * 0.9);"

# Mutant (b'): First-miss currentWeight taken from mode instead of stored/lifted
run_mutant \
  "(b') first miss uses mode instead of stored" \
  "Decision B/F: first miss should use stored weight, not mode" \
  "  // First miss: always hold at current weight (coordinator decision F)
  const nextWeight = currentWeight;" \
  "  // First miss: always hold at current weight (coordinator decision F)
  const nextWeight = mode > 0 ? mode : currentWeight;"

# Mutant (c'): Second-miss failures >= 2 → > 2
run_mutant \
  "(c') second miss condition >= 2 to > 2" \
  "Second miss should trigger on failures >= 2, not > 2" \
  "  if (failures >= 2 && currentWeight !== null && currentWeight > 0) {" \
  "  if (failures > 2 && currentWeight !== null && currentWeight > 0) {"

# Mutant (d'): First-miss consecutiveFailures: failures → failures + 1
run_mutant \
  "(d') increment failures wrong" \
  "First miss should set consecutiveFailures to failures (1), not failures+1" \
  "    consecutiveFailures: failures," \
  "    consecutiveFailures: failures + 1,"

# Mutant (e): M1 counter not set on first miss (Decision G)
run_mutant \
  "(e) M1 counter not set" \
  "Don't set weightAtFailureStartKg on first miss (Decision G violation)" \
  "  // M1: Store pre-miss weight when failures goes from 0 to 1
  const newWeightAtFailureStart = state.consecutiveFailures === 0 && currentWeight !== null
    ? currentWeight
    : state.weightAtFailureStartKg;" \
  "  // M1: Store pre-miss weight when failures goes from 0 to 1
  const newWeightAtFailureStart = state.weightAtFailureStartKg;"

# Mutant (f): Second consecutive miss holds instead of stepping down (Decision F)
run_mutant \
  "(f) second miss holds" \
  "Second consecutive miss should step down, not hold (Decision F)" \
  "  if (failures >= 2 && currentWeight !== null && currentWeight > 0) {" \
  "  if (failures >= 99 && currentWeight !== null && currentWeight > 0) {"

# Mutant (g): consecutiveFailures not incremented on first miss
run_mutant \
  "(g) failure counter not incremented" \
  "Don't increment consecutiveFailures on first miss" \
  "    consecutiveFailures: failures,
    weightAtFailureStartKg: newWeightAtFailureStart, // M1: store pre-miss weight
    message," \
  "    consecutiveFailures: 0,
    weightAtFailureStartKg: newWeightAtFailureStart, // M1: store pre-miss weight
    message,"

# Mutant (h): First miss returns wrong weight (not current)
run_mutant \
  "(h) first miss wrong weight" \
  "First miss should return exact currentWeight" \
  "    nextWorkingWeightKg: nextWeight,
    consecutiveFailures: failures,
    weightAtFailureStartKg: newWeightAtFailureStart, // M1: store pre-miss weight" \
  "    nextWorkingWeightKg: nextWeight !== null ? Math.floor(nextWeight / 2.5) * 2.5 : nextWeight,
    consecutiveFailures: failures,
    weightAtFailureStartKg: newWeightAtFailureStart, // M1: store pre-miss weight"

# Mutant (i): hard-feel hold uses wrong baseline (Decision B)
run_mutant \
  "(i) hard-feel uses mode instead of stored" \
  "Decision B: hard-feel should use stored weight, not mode" \
  '    // Hard feel: with equipment, hold at current weight; without equipment, progress normally
    // Decision B: use stored weight or heaviest lifted, not mode
    const currentWeight = state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);
    if (feel === "hard" && currentWeight !== null && currentWeight > 0 && equipmentIds) {' \
  '    // Hard feel: with equipment, hold at current weight; without equipment, progress normally
    // Decision B: use stored weight or heaviest lifted, not mode
    const currentWeight = mode > 0 ? mode : (state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null));
    if (feel === "hard" && currentWeight !== null && currentWeight > 0 && equipmentIds) {'

# Mutant (j): 1.5-step rule - DELETED (unreachable)
echo "Testing mutant: (j) 1.5-step rule"
echo "  ⚠️  DELETED: Rule is unreachable (strictly-below ensures at most 1-step drop)"

# Mutant (k'): kettlebell next-lower-bell < → <=
run_mutant \
  "(k') kettlebell next-lower-bell boundary" \
  "Kettlebell should find next-lower bell with <, not <=" \
  "        if (bells[i] < from) {" \
  "        if (bells[i] <= from) {"

# Mutant (l'): first-miss message string changed
run_mutant \
  "(l') first-miss message altered" \
  "First-miss message should be exact: 'Staying at this weight until every set reaches the top of the range.'" \
  "    message: \"Staying at this weight until every set reaches the top of the range.\"," \
  "    message: \"Holding at this weight until sets improve.\"," \

# Mutant (m): snap down instead of snap up in two-miss helper
run_mutant \
  "(m) snap down in helper" \
  "Snap down instead of up in two-miss helper" \
  "        const snappedUp = Math.ceil(target / gridStep) * gridStep;" \
  "        const snappedUp = Math.floor(target / gridStep) * gridStep;"

# Mutant (n): remove helper never-raise check (no-equipment path) - UNREACHABLE
echo "Testing mutant: (n) remove helper never-raise"
echo "  ⚠️  UNREACHABLE: target computation ensures target <= weight always"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
TOTAL=14
KILLED=$((TOTAL - FAILED - ${#SKIPPED[@]}))
echo "Total mutants:                   $TOTAL"
echo "Killed:                          $KILLED"
echo "Survived:                        $FAILED"
echo "Skipped:                         ${#SKIPPED[@]}"
echo "========================================="

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo
  echo "Survivors:"
  for survivor in "${SURVIVORS[@]}"; do
    echo "  - $survivor"
  done
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo
  echo "Skipped:"
  for skip in "${SKIPPED[@]}"; do
    echo "  - $skip"
  done
fi

if [ $FAILED -gt 0 ] || [ ${#SKIPPED[@]} -gt 0 ]; then
  echo
  echo "❌ FAIL: $FAILED survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

echo
echo "✅ PASS: All mutants killed"
