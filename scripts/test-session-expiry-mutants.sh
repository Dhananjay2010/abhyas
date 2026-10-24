#!/bin/bash
set -e

echo "Testing mutants for session expiry fix"
echo ""

# Store original files
cp src/lib/session/pending-set-retry.ts src/lib/session/pending-set-retry.ts.orig
cp src/app/session/[id]/session-runner.tsx src/app/session/[id]/session-runner.tsx.orig

exitCode=0

# Mutant (a): Clear the pending set on a 401
echo "=== Mutant (a): Clear pending set on 401 (should FAIL) ==="
sed -i 's/savePendingSet(storage, sessionId, pending);$/clearPendingSets(storage, sessionId); \/\/ MUTANT: clearing instead of saving/' src/lib/session/pending-set-retry.ts
if npm run test:pending-set-retry 2>&1 | grep -q "❌"; then
  echo "✓ Mutant (a) caught: test FAILED as expected (set not kept on 401)"
else
  echo "❌ Mutant (a) NOT caught: test should have failed"
  exitCode=1
fi
cp src/lib/session/pending-set-retry.ts.orig src/lib/session/pending-set-retry.ts

# Mutant (b): Treat 23505 as failure
echo ""
echo "=== Mutant (b): Treat 23505 as failure (should FAIL) ==="
sed -i 's/if (isDuplicateError(result)) {$/if (false \&\& isDuplicateError(result)) { \/\/ MUTANT: skip duplicate check/' src/lib/session/pending-set-retry.ts
if npm run test:pending-set-retry 2>&1 | grep -q "❌"; then
  echo "✓ Mutant (b) caught: test FAILED as expected (23505 not treated as success)"
else
  echo "❌ Mutant (b) NOT caught: test should have failed"
  exitCode=1
fi
cp src/lib/session/pending-set-retry.ts.orig src/lib/session/pending-set-retry.ts

# Mutant (c): Replay twice
echo ""
echo "=== Mutant (c): Replay twice (should FAIL) ==="
sed -i '/const result = await replayPendingSets(actions.logSet, storage, sessionId);/a\      await replayPendingSets(actions.logSet, storage, sessionId); \/\/ MUTANT: replay twice' src/app/session/[id]/session-runner.tsx
if npm run test:pending-set-retry 2>&1 | grep -q "❌"; then
  echo "✓ Mutant (c) caught: test FAILED as expected (double replay detected)"
else
  echo "❌ Mutant (c) NOT caught: test should have failed"
  exitCode=1
fi
cp src/app/session/[id]/session-runner.tsx.orig src/app/session/[id]/session-runner.tsx

# Mutant (d): Skip storage (use in-memory only)
echo ""
echo "=== Mutant (d): Skip localStorage persistence (should FAIL) ==="
sed -i 's/window.localStorage/({ getItem: () => null, setItem: () => {}, removeItem: () => {} } as any) \/\/ MUTANT: skip storage/' src/app/session/[id]/session-runner.tsx
if npm run test:pending-set-retry 2>&1 | grep -q "❌"; then
  echo "✓ Mutant (d) caught: test FAILED as expected (storage not used)"
else
  echo "❌ Mutant (d) NOT caught: test should have failed"
  exitCode=1
fi
cp src/app/session/[id]/session-runner.tsx.orig src/app/session/[id]/session-runner.tsx

# Mutant (e): Mark saved before server confirms
echo ""
echo "=== Mutant (e): Mark saved before server confirms (should FAIL) ==="
sed -i 's/if (result.ok && result.saved) {$/if (true) { \/\/ MUTANT: always mark as saved/' src/app/session/[id]/session-runner.tsx
if npm run test:pending-set-retry 2>&1 | grep -q "❌"; then
  echo "✓ Mutant (e) caught: test FAILED as expected (marked saved without confirmation)"
else
  echo "❌ Mutant (e) NOT caught: test should have failed"
  exitCode=1
fi
cp src/app/session/[id]/session-runner.tsx.orig src/app/session/[id]/session-runner.tsx

# Cleanup
rm -f src/lib/session/pending-set-retry.ts.orig
rm -f src/app/session/[id]/session-runner.tsx.orig

echo ""
if [ $exitCode -eq 0 ]; then
  echo "✅ All mutants caught"
else
  echo "❌ Some mutants not caught"
fi

exit $exitCode
