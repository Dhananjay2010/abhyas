#!/bin/bash
# Mutant test: Drop the getSessionSummary call in session-runner.tsx

set -e

MUTANT_FILE="src/app/session/[id]/session-runner.tsx"
BACKUP="$MUTANT_FILE.mutant-backup"
TEST="scripts/test-session-summary-banner.tsx"

echo "Mutant test: Drop getSessionSummary call"

# Backup original
cp "$MUTANT_FILE" "$BACKUP"
trap "mv '$BACKUP' '$MUTANT_FILE'" EXIT

# Baseline: test must pass
echo "Running baseline test..."
if ! npm run test:session-summary-banner > /dev/null 2>&1; then
  echo "❌ Baseline test failed"
  exit 1
fi
echo "✓ Baseline passed"

# Kill the call: replace getSessionSummary(sessionId).then with Promise.resolve({ok:false}).then
sed -i 's/actions\.getSessionSummary(sessionId)\.then(/Promise.resolve({ok:false as const, error:""}).then(/g' "$MUTANT_FILE"

# Verify mutation applied
if ! grep -q "Promise.resolve({ok:false" "$MUTANT_FILE"; then
  echo "❌ Mutation did not apply"
  exit 1
fi
echo "✓ Mutation applied"

# Run test - should FAIL
echo "Running test against mutant..."
if npm run test:session-summary-banner > /dev/null 2>&1; then
  echo "❌ MUTANT SURVIVED: Test passed when getSessionSummary call was dropped"
  exit 1
fi

# Get first FAIL line
npm run test:session-summary-banner 2>&1 | grep -E "✗|Error|expect" | head -1

echo "✓ MUTANT KILLED by test failure"
exit 0
