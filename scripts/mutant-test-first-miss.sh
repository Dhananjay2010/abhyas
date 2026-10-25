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
  if ! eval "$COMPILE_CMD" > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: Does not compile"
    SKIPPED+=("$name: does not compile")
    restore_or_die
    MUTATION_APPLIED=false
    return 0
  fi
  
  # Run tests
  if eval "$MUTANT_TEST_CMD" > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ KILLED"
  fi
  
  # Restore
  restore_or_die
  MUTATION_APPLIED=false
  return 0
}

# Mutant (a): Remove 20% guard
run_mutant \
  "(a) remove 20% guard" \
  "Change cutFraction > THRESHOLD to cutFraction > 99" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {" \
  "if (cutFraction > 99) {"

# Mutant (b): Threshold 0.20 → 0.5
run_mutant \
  "(b) threshold 0.20 → 0.5" \
  "Change FIRST_MISS_HOLD_THRESHOLD from 0.20 to 0.50" \
  "export const FIRST_MISS_HOLD_THRESHOLD = 0.20;" \
  "export const FIRST_MISS_HOLD_THRESHOLD = 0.50;"

# Mutant (c): > to >= - EQUIVALENT
# Proof: Grid step g: candidate w−g; an exact 20% cut means w=5g; RAW 0.9w=4.5g ceils to 5g=w, 
# so two-miss holds and Rule 2 holds the first miss. Kettlebells: the only adjacent 20% pair is 
# 10→8, and no bell lies in [9,10). No equipment: no Rule 1.
# Therefore (c) is equivalent to the original and cannot be killed by tests.

# Mutant (d): Guard inverted (always hold)
run_mutant \
  "(d) guard inverted" \
  "Invert the guard condition" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {" \
  "if (cutFraction < FIRST_MISS_HOLD_THRESHOLD) {"

# Mutant (e): consecutiveFailures not incremented
run_mutant \
  "(e) failure counter not incremented" \
  "Don't increment consecutiveFailures on first miss" \
  "    consecutiveFailures: failures," \
  "    consecutiveFailures: 0,"

# Mutant (f): kettlebell strictly-below
run_mutant \
  "(f) kettlebell strictly-below" \
  "Allow kettlebell to equal or be below current (not strictly below)" \
  "        if (bells[i] < currentWeight - epsilon) {" \
  "        if (bells[i] <= currentWeight) {"

# Mutant (g): first-miss >= two-miss guard
run_mutant \
  "(g) hold when candidate < two-miss" \
  "Don't hold when candidate < two-miss" \
  "      if (candidateWeight < twoMissFloor) {
        candidateWeight = currentWeight;
        holdReason = 'twomiss';
      }" \
  "      if (candidateWeight < twoMissFloor) {
        candidateWeight = candidateWeight;
        holdReason = 'twomiss';
      }"

# Mutant (h): first-miss hold snap
run_mutant \
  "(h) hold snaps weight" \
  "Snap hold weight to grid instead of returning exact current" \
  "    nextWorkingWeightKg: nextWeight," \
  "    nextWorkingWeightKg: nextWeight !== null ? Math.floor(nextWeight / 2.5) * 2.5 : nextWeight,"

# Mutant (i): hard-feel hold
run_mutant \
  "(i) hard-feel doesn't hold" \
  "Change hard-feel check to right (never holds early)" \
  '    if (feel === "hard" && currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {' \
  '    if (feel === "right" && currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {'

# Mutant (j): 1.5-step rule - DELETED
echo "Testing mutant: (j) 1.5-step rule"
echo "  ⚠️  DELETED: Rule is unreachable (strictly-below ensures at most 1-step drop)"

# Mutant (k): standard equipment strictly-below
run_mutant \
  "(k) standard equipment strictly-below" \
  "Round instead of floor for strictly-below" \
  "      const stepsBelow = Math.floor((currentWeight - epsilon) / gridStep);" \
  "      const stepsBelow = Math.round(currentWeight / gridStep);"

# Mutant (l): threshold 0.20 → 0.25
run_mutant \
  "(l) threshold 0.20 → 0.25" \
  "Change threshold to 0.25 (25%)" \
  "export const FIRST_MISS_HOLD_THRESHOLD = 0.20;" \
  "export const FIRST_MISS_HOLD_THRESHOLD = 0.25;"

# Mutant (m): snap down instead of snap up in helper
run_mutant \
  "(m) snap down in helper" \
  "Snap down instead of up in two-miss helper" \
  "        const snappedUp = Math.ceil(target / gridStep) * gridStep;" \
  "        const snappedUp = Math.floor(target / gridStep) * gridStep;"

# Mutant (n): remove helper never-raise check (no-equipment path) - UNREACHABLE
# The never-raise check is unreachable because target is computed as:
# target = max(floor(0.9*weight / grid) * grid, 0.9*weight - increment)
# Both components are <= 0.9*weight < weight, so target can never be > weight.
echo "Testing mutant: (n) remove helper never-raise"
echo "  ⚠️  UNREACHABLE: target computation ensures target <= weight always"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
TOTAL=11
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
