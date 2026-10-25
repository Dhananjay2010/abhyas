#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for first-miss hold guard
# Uses Node string replacement with exact-match assertions
# mktemp backups with restore trap
# Exit 1 on any survivor or skip

FILE="src/lib/program/progression.ts"
BACKUP=$(mktemp)
FAILED=0
SURVIVORS=()
SKIPPED=()
MUTATION_APPLIED=false

echo "=== Mutant Testing: First-Miss Hold Guard ==="
echo

# Back up original BEFORE setting any trap
cp "$FILE" "$BACKUP"

# Verify backup exists, is non-empty, and is byte-identical
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

cleanup() {
  if [ ! -f "$BACKUP" ]; then
    echo "⚠️  WARNING: Backup file missing, cannot restore"
    return
  fi
  
  if [ ! -s "$BACKUP" ]; then
    echo "⚠️  WARNING: Backup file is empty, refusing to restore"
    return
  fi
  
  if [ "$MUTATION_APPLIED" = true ]; then
    cp "$BACKUP" "$FILE"
  fi
  
  rm -f "$BACKUP"
}

trap cleanup EXIT INT TERM

# Baseline: run tests
echo "Running baseline tests..."
if ! npm run test:first-miss-pinned > /dev/null 2>&1; then
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
  cat > /tmp/mutate.js << 'MUTATE_SCRIPT'
const fs = require('fs');
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
fs.writeFileSync(process.argv[2], newContent, 'utf8');
MUTATE_SCRIPT
  
  node /tmp/mutate.js "$FILE" "$search" "$replace" 2>&1
  NODE_EXIT=$?
  
  if [ $NODE_EXIT -ne 0 ]; then
    echo "  ❌ SKIPPED: String replacement failed"
    SKIPPED+=("$name: replacement failed")
    return 0
  fi
  
  # Mark that mutation was applied
  MUTATION_APPLIED=true
  
  # Verify file changed
  if cmp -s "$FILE" "$BACKUP"; then
    echo "  ❌ SKIPPED: File did not change"
    SKIPPED+=("$name: file unchanged")
    cp "$BACKUP" "$FILE"
    MUTATION_APPLIED=false
    return 0
  fi
  
  # Check tsc compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: Does not compile"
    SKIPPED+=("$name: does not compile")
    cp "$BACKUP" "$FILE"
    MUTATION_APPLIED=false
    return 0
  fi
  
  # Run tests
  if npm run test:first-miss-pinned > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ KILLED"
  fi
  
  # Restore
  cp "$BACKUP" "$FILE"
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

# Mutant (c): > to >=
run_mutant \
  "(c) > to >=" \
  "Change cutFraction > THRESHOLD to >=" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {" \
  "if (cutFraction >= FIRST_MISS_HOLD_THRESHOLD) {"

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
  "    if (candidateWeight < twoMissFloor) {
      candidateWeight = currentWeight;
    }" \
  "    if (candidateWeight < twoMissFloor) {
      candidateWeight = candidateWeight;
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

# Clean up temp script
rm -f /tmp/mutate.js

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
TOTAL=12
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
