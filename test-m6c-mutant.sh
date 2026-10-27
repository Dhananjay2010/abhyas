#!/bin/bash
set -e

echo "Testing M6c mutant (test-runner-offline-friendly)..."

# Save original
cp src/app/session/\[id\]/session-runner.tsx src/app/session/\[id\]/session-runner.tsx.bak

# Inject M6c mutant: runnerErrorMessage(err,'action') → err.message
sed -i "s/setError(runnerErrorMessage(err, 'action'))/setError(err.message)/" src/app/session/\[id\]/session-runner.tsx

# Run test - should FAIL with mutant
if npm run test:runner-offline-friendly > /tmp/m6c-mutant.log 2>&1; then
  echo "❌ M6c SURVIVED: test passed with mutant (should have failed)"
  cat /tmp/m6c-mutant.log | tail -30
  mv src/app/session/\[id\]/session-runner.tsx.bak src/app/session/\[id\]/session-runner.tsx
  exit 1
else
  echo "✅ M6c KILLED: test failed as expected"
  echo "Failing assertion:"
  grep -A2 "run() actions show" /tmp/m6c-mutant.log || grep -A2 "Raw '500" /tmp/m6c-mutant.log || tail -20 /tmp/m6c-mutant.log
fi

# Restore original
mv src/app/session/\[id\]/session-runner.tsx.bak src/app/session/\[id\]/session-runner.tsx

echo ""
echo "M6c mutant verification complete"
