#!/bin/bash
# Mutant test: verify only open sessions used for newestStrengthStartedAt
set -e

echo ""
echo "Mutant test: Include completed sessions in newestStrengthStartedAt"
echo "=================================================================="
echo ""

# Create temp files
BACKUP_FILE=$(mktemp "${TMPDIR:-/tmp}/in-progress-original.XXXXXX")
OUTPUT_FILE=$(mktemp "${TMPDIR:-/tmp}/mutant-output.XXXXXX")

# Trap to restore and cleanup
trap 'if [ -s "$BACKUP_FILE" ]; then mv "$BACKUP_FILE" src/lib/session/in-progress.ts 2>/dev/null || true; fi; rm -f "$BACKUP_FILE" "$OUTPUT_FILE"' EXIT

# Backup original
cp src/lib/session/in-progress.ts "$BACKUP_FILE"

# Apply mutant: remove status filter (include ALL sessions, not just open)
sed -i 's/\.in("status", \["planned", "in_progress"\]);/;/g' src/lib/session/in-progress.ts

echo "Applied mutant: removed status filter (includes completed sessions)"
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
