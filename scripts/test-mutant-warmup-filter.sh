#!/bin/bash
# Mutant test: verify warm-up sets are included in staleness check
set -e

echo ""
echo "Mutant test: Re-add is_warmup_set filter to staleness check"
echo "=================================================================="
echo ""

# Create temp files
BACKUP_FILE=$(mktemp "${TMPDIR:-/tmp}/in-progress-original.XXXXXX")
OUTPUT_FILE=$(mktemp "${TMPDIR:-/tmp}/mutant-output.XXXXXX")

# Trap to restore and cleanup
trap 'if [ -s "$BACKUP_FILE" ]; then mv "$BACKUP_FILE" src/lib/session/in-progress.ts 2>/dev/null || true; fi; rm -f "$BACKUP_FILE" "$OUTPUT_FILE"' EXIT

# Backup original
cp src/lib/session/in-progress.ts "$BACKUP_FILE"

# Apply mutant: add is_warmup_set filter back (old buggy behavior)
sed -i 's/\.in("session_exercise_id", exerciseIdsForStale);/.eq("is_warmup_set", false)\n      .in("session_exercise_id", exerciseIdsForStale);/g' src/lib/session/in-progress.ts

echo "Applied mutant: added is_warmup_set=false filter (buggy staleness check)"
echo ""

# Run test - should fail
set +e
npx tsx scripts/test-in-progress-session.ts 2>&1 | tee "$OUTPUT_FILE"
TEST_EXIT=${PIPESTATUS[0]}
set -e

# Restore original
mv "$BACKUP_FILE" src/lib/session/in-progress.ts

# Report result
echo ""
echo "=================================================================="
if [ $TEST_EXIT -ne 0 ]; then
  echo "✓ PASS: Mutant was caught (test failed as expected)"
  echo "=================================================================="
  echo ""
  echo "Failure summary:"
  grep -E "FAIL|failures" "$OUTPUT_FILE" | tail -5
  echo ""
  exit 0
else
  echo "✗ FAIL: Mutant was NOT caught (test passed incorrectly)"
  echo "=================================================================="
  echo ""
  exit 1
fi
