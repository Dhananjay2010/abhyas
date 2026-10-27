#!/bin/bash
set -e

echo "Testing M8 mutant (test-layout-replay)..."

# Save original
cp src/components/pending-set-replay-provider.tsx src/components/pending-set-replay-provider.tsx.bak

# Inject M8 mutant: setUserId(userId) → setUserId(prev => prev && userId ? prev : userId)
sed -i 's/setUserId(userId)/setUserId(prev => prev \&\& userId ? prev : userId)/' src/components/pending-set-replay-provider.tsx

# Run test - should FAIL with mutant
if npm run test:layout-replay > /tmp/m8-mutant.log 2>&1; then
  echo "❌ M8 SURVIVED: test passed with mutant (should have failed)"
  cat /tmp/m8-mutant.log | tail -30
  mv src/components/pending-set-replay-provider.tsx.bak src/components/pending-set-replay-provider.tsx
  exit 1
else
  echo "✅ M8 KILLED: test failed as expected"
  echo "Failing assertion:"
  grep -A2 "Shows user2" /tmp/m8-mutant.log || grep -A2 "Does NOT show user1" /tmp/m8-mutant.log || tail -20 /tmp/m8-mutant.log
fi

# Restore original
mv src/components/pending-set-replay-provider.tsx.bak src/components/pending-set-replay-provider.tsx

echo ""
echo "M8 mutant verification complete"
