#!/bin/bash
# Mutant test: verify only open sessions used for newestStrengthStartedAt
set -e

echo ""
echo "Mutant test: Include completed sessions in newestStrengthStartedAt"
echo "=================================================================="
echo ""

# Backup original
cp src/lib/session/in-progress.ts /tmp/in-progress-original.ts

# Apply mutant: remove status filter (include ALL sessions, not just open)
sed -i 's/\.in("status", \["planned", "in_progress"\]);/;/g' src/lib/session/in-progress.ts

echo "Applied mutant: removed status filter (includes completed sessions)"
echo ""

# Run test - should fail
set +e
npx tsx scripts/test-in-progress-session.ts 2>&1 | tee /tmp/mutant-output.txt
TEST_EXIT=${PIPESTATUS[0]}
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
