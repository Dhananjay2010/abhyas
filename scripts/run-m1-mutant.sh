#!/usr/bin/env bash

# M1 mutant: Remove default window listener wiring
# This should cause the test to fail because 'online' events won't trigger replay

FILE="src/lib/session/pending-set-controller.ts"
BACKUP="${FILE}.m1-backup"

echo "📋 M1 Mutant: Remove default window listener wiring"
echo ""

# Backup
cp "$FILE" "$BACKUP"

# Apply mutant: replace default listener code with just the prop assignment
# Lines 103-111 currently provide fallback to window.addEventListener
# Change them to just use the prop (which will be undefined in M1 test)
perl -i -pe 's/^  const addEventListener = addEventListenerProp \|\| \($/  const addEventListener = addEventListenerProp;/' "$FILE"
perl -i -0777 -pe 's/    typeof window !== "undefined"\n      \? \(type: string, handler: \(\) => void\) => window\.addEventListener\(type, handler\)\n      : undefined\n  \);//gs' "$FILE"
perl -i -pe 's/^  const removeEventListener = removeEventListenerProp \|\| \($/  const removeEventListener = removeEventListenerProp;/' "$FILE"
perl -i -0777 -pe 's/    typeof window !== "undefined"\n      \? \(type: string, handler: \(\) => void\) => window\.removeEventListener\(type, handler\)\n      : undefined\n  \);//gs' "$FILE"

echo "Applied mutant: removed default window listener wiring"
echo "Running test..."
echo ""

# Run test (should fail when mutant is present)
npm run test:m1-online-replay 2>&1 | tail -15
TEST_EXIT=${PIPESTATUS[0]}

if [ $TEST_EXIT -eq 0 ]; then
  # Test passed - mutant survived
  echo ""
  echo "❌ MUTANT SURVIVED: Test passed when it should have failed!"
  mv "$BACKUP" "$FILE"
  exit 1
else
  # Test failed - mutant killed
  echo ""
  echo "✅ MUTANT KILLED: Test correctly failed without default listeners"
  echo "Break: Without default window listeners, 'online' events are ignored"
  mv "$BACKUP" "$FILE"
  exit 0
fi
