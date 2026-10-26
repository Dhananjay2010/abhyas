#!/bin/bash
set -e

# Mutant proof: Restore main's inline startSession (without stale-close) and 
# verify the integration test FAILS.
#
# This proves the test detects when startSession bypasses startSessionFullCore.

echo "=== Mutant proof for startSession integration test ==="
echo ""

# Save the current version
cp src/app/session/actions.ts /tmp/actions-with-core.ts

# Restore main's inline implementation (commit b5161d8b)
echo "Restoring main's inline startSession implementation..."
git show b5161d8b:src/app/session/actions.ts > src/app/session/actions.ts

# Run the test - it should FAIL
echo "Running integration test against mutant (should FAIL)..."
set +e
set -o pipefail
npm run test:start-session-action-integration 2>&1 | tee /tmp/mutant-test-output.txt
MUTANT_EXIT_CODE=${PIPESTATUS[0]}
set +o pipefail
set -e

# Restore the refactored version
echo ""
echo "Restoring refactored version..."
cp /tmp/actions-with-core.ts src/app/session/actions.ts

# Check results
if [ $MUTANT_EXIT_CODE -eq 0 ]; then
  echo ""
  echo "❌ MUTANT PROOF FAILED: Test passed with main's inline implementation"
  echo "The test doesn't detect when startSession bypasses startSessionFullCore!"
  exit 1
else
  echo ""
  echo "✓ MUTANT PROOF PASSED: Test failed with main's inline implementation"
  echo "The test correctly detects when stale-close logic is bypassed."
  
  # Show which assertion failed
  echo ""
  echo "Failed assertion:"
  grep "✗" /tmp/mutant-test-output.txt || true
  grep "expected" /tmp/mutant-test-output.txt | head -1 || true
fi
