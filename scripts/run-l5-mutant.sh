#!/usr/bin/env bash

# L5 mutant: Remove the 5-attempt cap on automatic retries
# This should cause the 6th auto-retry to be scheduled when it shouldn't

FILE="src/lib/session/pending-set-controller.ts"
BACKUP="${FILE}.l5-backup"

echo "📋 L5 Mutant: Remove 5-attempt retry cap"
echo ""

# Backup
cp "$FILE" "$BACKUP"

# Apply mutant: remove the failedAttempts < 5 check
# Line should be: if (remaining.length > 0 && scheduler && failedAttempts < 5) {
# Change to: if (remaining.length > 0 && scheduler) {
sed -i 's/remaining.length > 0 && scheduler && failedAttempts < 5/remaining.length > 0 \&\& scheduler/' "$FILE"

echo "Applied mutant: removed failedAttempts < 5 cap"
echo "Running test..."
echo ""

# Run test
npm run test:l5-retry-cap 2>&1 | tail -15
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
  echo "✅ MUTANT KILLED: Test correctly failed without retry cap"
  echo "Break: Without the 5-attempt cap, auto-retries continue indefinitely"
  mv "$BACKUP" "$FILE"
  exit 0
fi
