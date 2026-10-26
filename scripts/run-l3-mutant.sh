#!/usr/bin/env bash

# L3 mutant: Remove the pending sets check in feel button onClick
# This should cause finishExercise to be called even when sets are queued

FILE="src/app/session/[id]/session-runner.tsx"
BACKUP="${FILE}.l3-backup"

echo "📋 L3 Mutant: Remove pending sets check in feel button"
echo ""

# Backup
cp "$FILE" "$BACKUP"

# Apply mutant: replace the onClick handler to always call onFinishExercise
# Find the feel button onClick and remove the pending sets check
# The current code checks `if (pendingSetState.pending.length > 0 && controller)` 
# Change it to always proceed with onFinishExercise
perl -i -0777 -pe 's/onClick=\{async \(\) => \{\s+\/\/ L3: If sets are queued.*?\n\s+if \(pendingSetState\.pending\.length > 0 && controller\) \{.*?else \{\s+await onFinishExercise\(f\.value\);\s+\}\s+\}\}/onClick={() => onFinishExercise(f.value)}/gs' "$FILE"

echo "Applied mutant: removed pending sets check in feel button onClick"
echo "Running test..."
echo ""

# Run test
npm run test:l3-feel-button-queued 2>&1 | tail -15
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
  echo "✅ MUTANT KILLED: Test correctly failed without pending check"
  echo "Break: Without pending check, finishExercise called even with queued sets"
  mv "$BACKUP" "$FILE"
  exit 0
fi
