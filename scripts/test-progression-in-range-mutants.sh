#!/bin/bash
# Mutant testing for progression in-range fix
# Verifies that removing key logic makes tests fail

set -e

echo "=== MUTANT TEST 1: Remove repsMin check ==="
echo "Temporarily removing the hitMinOfRange check..."

# Save the original
cp src/lib/program/progression.ts src/lib/program/progression.ts.backup

# Mutant 1: Remove the hitMinOfRange check by always setting inRange to false
sed -i 's/const inRange = completedAllSets && hitMinOfRange && !hitTopOfRange;/const inRange = false; \/\/ MUTANT: disabled/' src/lib/program/progression.ts

echo "Running tests with mutant (should fail)..."
if npx tsx scripts/test-progression-in-range-hold.ts 2>&1 | tee /tmp/mutant1-output.txt | grep -q "FAIL"; then
  echo "✓ MUTANT 1 CAUGHT: Tests failed as expected when repsMin check removed"
  failures=$(grep "FAILURES" /tmp/mutant1-output.txt || echo "many FAILURES")
  echo "  ($failures)"
else
  echo "✗ MUTANT 1 ESCAPED: Tests should have failed!"
  cp src/lib/program/progression.ts.backup src/lib/program/progression.ts
  exit 1
fi

# Restore
cp src/lib/program/progression.ts.backup src/lib/program/progression.ts

echo ""
echo "=== MUTANT TEST 2: Don't reset failures in in-range case ==="
echo "Temporarily keeping failures incremented in in-range path..."

# Mutant 2: In the in-range block (line ~566), change consecutiveFailures from 0 to state.consecutiveFailures + 1
# This simulates not resetting failures for in-range sessions
sed -i '/if (inRange) {/,/^  }/{ s/consecutiveFailures: 0,/consecutiveFailures: state.consecutiveFailures + 1, \/\/ MUTANT: not reset/; }' src/lib/program/progression.ts

echo "Running tests with mutant (should fail)..."
if npx tsx scripts/test-progression-in-range-hold.ts 2>&1 | tee /tmp/mutant2-output.txt | grep -q "FAIL"; then
  echo "✓ MUTANT 2 CAUGHT: Tests failed as expected when failure reset removed"
  failures=$(grep "FAILURES" /tmp/mutant2-output.txt || echo "many FAILURES")
  echo "  ($failures)"
else
  echo "✗ MUTANT 2 ESCAPED: Tests should have failed!"
  cp src/lib/program/progression.ts.backup src/lib/program/progression.ts
  exit 1
fi

# Restore
cp src/lib/program/progression.ts.backup src/lib/program/progression.ts

echo ""
echo "=== Verifying fix is restored ==="
if npx tsx scripts/test-progression-in-range-hold.ts 2>&1 | grep -q "ALL CHECKS PASSED"; then
  echo "✓ Fix restored: All tests pass"
else
  echo "✗ Fix not properly restored"
  exit 1
fi

# Clean up
rm src/lib/program/progression.ts.backup

echo ""
echo "=== MUTANT TESTING COMPLETE ==="
echo "Both mutants were caught by the tests."
