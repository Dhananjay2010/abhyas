#!/usr/bin/env bash

# L6/U1 mutant: Remove busyRef guard in onFinishExercise
# This should allow double-tap to call finishExercise twice

FILE="src/app/session/[id]/session-runner.tsx"
BACKUP="${FILE}.l6-backup"

echo "📋 L6/U1 Mutant: Remove busyRef guard in onFinishExercise"
echo ""

# Backup
cp "$FILE" "$BACKUP"

# Apply mutant: remove the busyRef check and set/clear
# Find and remove: if (busyRef.current) return;
# Find and remove: busyRef.current = true; (in onFinishExercise)
# Find and remove: busyRef.current = false; (in onFinishExercise finally block)

sed -i '/async function onFinishExercise/,/^  }$/ {
  /if (busyRef.current) return;/d
  /busyRef.current = true;/d
  /busyRef.current = false;/d
}' "$FILE"

echo "Applied mutant: removed busyRef guard in onFinishExercise"
echo "Running test..."
echo ""

# Run test
npm run test:l6-double-tap-guard 2>&1 | tail -15
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
  echo "✅ MUTANT KILLED: Test correctly failed without busyRef guard"
  echo "Break: Without busyRef, double-tap calls finishExercise twice"
  mv "$BACKUP" "$FILE"
  exit 0
fi
