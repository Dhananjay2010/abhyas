#!/bin/bash
# Mutant test: verify test catches when isSessionStale check is removed
set -e

echo ""
echo "Mutant test: Remove isSessionStale check from getInProgressSession"
echo "=================================================================="
echo ""

# Create temp files
BACKUP_FILE=$(mktemp "${TMPDIR:-/tmp}/in-progress-original.XXXXXX")
OUTPUT_FILE=$(mktemp "${TMPDIR:-/tmp}/mutant-output.XXXXXX")

# Trap to restore and cleanup
trap 'if [ -s "$BACKUP_FILE" ]; then mv "$BACKUP_FILE" src/lib/session/in-progress.ts 2>/dev/null || true; fi; rm -f "$BACKUP_FILE" "$OUTPUT_FILE"' EXIT

# Backup original
cp src/lib/session/in-progress.ts "$BACKUP_FILE"

# Apply mutant: replace isSessionStale call to always return false (not stale)
sed -i 's/if (isSessionStale({/if (false \&\& isSessionStale({/g' src/lib/session/in-progress.ts

echo "Applied mutant: staleness check bypassed (always false)"
echo ""

# Run test
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
