#!/bin/bash
# Mutant test: verify warm-up sets are included in staleness check
set -e

echo ""
echo "Mutant test: Re-add is_warmup_set filter to staleness check"
echo "=================================================================="
echo ""

# Backup original
cp src/lib/session/in-progress.ts /tmp/in-progress-original.ts

# Apply mutant: add is_warmup_set filter back (old buggy behavior)
sed -i 's/\.in("session_exercise_id", exerciseIdsForStale);/.eq("is_warmup_set", false)\n      .in("session_exercise_id", exerciseIdsForStale);/g' src/lib/session/in-progress.ts

echo "Applied mutant: added is_warmup_set=false filter (buggy staleness check)"
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
