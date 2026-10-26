#!/usr/bin/env bash
# M1 mutant: Use roundToPlate instead of roundLbToHalf for prefill

set -euo pipefail

echo "M1 Mutant Test: Use roundToPlate instead of roundLbToHalf"
echo "=========================================================="
echo ""

# Save original
cp src/app/session/[id]/session-runner.tsx /tmp/session-runner.backup.tsx

# Apply mutant: Replace roundLbToHalf with roundToPlate
sed -i 's/const rounded = roundLbToHalf(displayValue);/const rounded = roundToPlate(displayValue, units);/' src/app/session/[id]/session-runner.tsx

echo "Applied mutant: Changed roundLbToHalf to roundToPlate in prefill logic"
echo ""
echo "Running test..."
echo ""

# Run the test (should FAIL)
if npx tsx scripts/test-units-m1-runner-prefill-real.tsx 2>&1; then
  echo ""
  echo "❌ MUTANT SURVIVED: Test passed when it should have failed!"
  mv /tmp/session-runner.backup.tsx src/app/session/[id]/session-runner.tsx
  exit 1
else
  EXITCODE=$?
  echo ""
  echo "✓ MUTANT KILLED: Test failed as expected (exit code: $EXITCODE)"
  echo ""
fi

# Restore original
mv /tmp/session-runner.backup.tsx src/app/session/[id]/session-runner.tsx

echo "Original file restored"
echo ""
echo "✅ M1 mutant test PASSED: roundLbToHalf is required"
