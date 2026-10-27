#!/bin/bash
set -e

echo "Testing M3a mutant (test-discard-clock-injection)..."

# Save original
cp src/components/pending-set-replay.tsx src/components/pending-set-replay.tsx.bak

# Inject M3a mutant: createPendingSetDeps(now) → createPendingSetDeps()
sed -i 's/createPendingSetDeps(now)/createPendingSetDeps()/' src/components/pending-set-replay.tsx

# Run test - should FAIL with mutant
if npm run test:discard-clock-injection > /tmp/m3a-mutant.log 2>&1; then
  echo "❌ M3a SURVIVED: test passed with mutant (should have failed)"
  cat /tmp/m3a-mutant.log | tail -30
  mv src/components/pending-set-replay.tsx.bak src/components/pending-set-replay.tsx
  exit 1
else
  echo "✅ M3a KILLED: test failed as expected"
  echo "Failing assertion:"
  grep -A2 "Survivor timestamp" /tmp/m3a-mutant.log || grep -A2 "Error:" /tmp/m3a-mutant.log || tail -20 /tmp/m3a-mutant.log
fi

# Restore original
mv src/components/pending-set-replay.tsx.bak src/components/pending-set-replay.tsx

echo ""
echo "M3a mutant verification complete"
