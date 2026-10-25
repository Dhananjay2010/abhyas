#!/bin/bash
# Mutant test: verify test catches when isSessionStale check is removed
set -e

echo ""
echo "Mutant test: Remove isSessionStale check from getInProgressSession"
echo "=================================================================="
echo ""

# Backup original
cp src/lib/session/in-progress.ts /tmp/in-progress-original.ts

# Apply mutant: replace isSessionStale call to always return false (not stale)
sed -i 's/if (isSessionStale({/if (false \&\& isSessionStale({/g' src/lib/session/in-progress.ts

echo "Applied mutant: staleness check bypassed (always false)"
echo ""

# Run test
set +e
npx tsx scripts/test-in-progress-session.ts 2>&1 | tee /tmp/mutant-output.txt
TEST_EXIT=$?
set -e

# Restore original
mv /tmp/in-progress-original.ts src/lib/session/in-progress.ts

# Report result
echo ""
echo "=================================================================="
if [ $TEST_EXIT -ne 0 ]; then
  echo "✓ PASS: Mutant was caught (test failed as expected)"
  echo "=================================================================="
  echo ""
  echo "Failure summary:"
  grep -E "FAIL|failures" /tmp/mutant-output.txt | tail -5
  echo ""
  exit 0
else
  echo "✗ FAIL: Mutant was NOT caught (test passed incorrectly)"
  echo "=================================================================="
  echo ""
  exit 1
fi
