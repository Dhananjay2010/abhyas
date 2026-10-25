#!/bin/bash
# Mutant testing for progression in-range fix
# Verifies that removing key logic makes tests fail
# Uses temporary copies and EXIT trap to ensure src is never left mutated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_FILE="$SCRIPT_DIR/../src/lib/program/progression.ts"
TEMP_DIR=$(mktemp -d)
trap "cp '$TEMP_DIR/progression.ts.orig' '$SRC_FILE' 2>/dev/null || true; rm -rf '$TEMP_DIR'" EXIT

# Save original first
cp "$SRC_FILE" "$TEMP_DIR/progression.ts.orig"

# Function to run test with mutated code
run_mutant_test() {
  local mutant_name="$1"
  local sed_pattern="$2"
  
  echo "=== MUTANT TEST: $mutant_name ==="
  echo "Creating mutant..."
  
  # Apply mutation
  sed "$sed_pattern" "$TEMP_DIR/progression.ts.orig" > "$SRC_FILE"
  
  echo "Running tests with mutant (should fail)..."
  if npx tsx scripts/test-progression-in-range-hold.ts 2>&1 | tee "$TEMP_DIR/mutant-output.txt" | grep -q "FAIL"; then
    echo "✓ MUTANT CAUGHT: Tests failed as expected"
    failures=$(grep "FAILURES" "$TEMP_DIR/mutant-output.txt" || echo "many FAILURES")
    echo "  ($failures)"
    result=0
  else
    echo "✗ MUTANT ESCAPED: Tests should have failed!"
    result=1
  fi
  
  # Restore original
  cp "$TEMP_DIR/progression.ts.orig" "$SRC_FILE"
  
  return $result
}

# Mutant 1: Remove repsMin check
run_mutant_test \
  "Remove repsMin check" \
  's/const inRange = completedAllSets && hitMinOfRange && !hitTopOfRange;/const inRange = false; \/\/ MUTANT: disabled/'

echo ""

# Mutant 2: Don't reset failures in in-range case
run_mutant_test \
  "Don't reset failures" \
  '/if (inRange) {/,/^  }/{ s/consecutiveFailures: 0,/consecutiveFailures: state.consecutiveFailures + 1, \/\/ MUTANT: not reset/; }'

echo ""
echo "=== Verifying fix is restored ==="
if npx tsx scripts/test-progression-in-range-hold.ts 2>&1 | grep -q "ALL CHECKS PASSED"; then
  echo "✓ Fix restored: All tests pass"
else
  echo "✗ Fix not properly restored"
  exit 1
fi

# Final safety check: ensure source file is unmodified
if ! diff -q "$TEMP_DIR/progression.ts.orig" "$SRC_FILE" > /dev/null; then
  echo "✗ ERROR: Source file was not properly restored!"
  cp "$TEMP_DIR/progression.ts.orig" "$SRC_FILE"
  exit 1
fi

echo ""
echo "=== MUTANT TESTING COMPLETE ==="
echo "Both mutants were caught by the tests."


