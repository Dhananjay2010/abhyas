#!/usr/bin/env bash
# Mutant: restrict pending-exercise endedEarly rule to completed sessions only.
# Should FAIL test case 3 in test-build-history-list-items.ts (in-progress + pending → endedEarly).

set -e

TARGET="src/lib/history/compute-ended-early.ts"
BACKUP=$(mktemp)

echo "Mutant: restrict pending rule to completed sessions"
echo "Target: $TARGET"

cp "$TARGET" "$BACKUP"
trap "mv '$BACKUP' '$TARGET'" EXIT

# Mutant: add status === "completed" check to first condition
sed -i 's/hasPendingExercise &&/hasPendingExercise \&\& status === "completed" \&\&/' "$TARGET"

echo "Running test (should FAIL)..."
if npx tsx scripts/test-build-history-list-items.ts > /tmp/mutant-output.txt 2>&1; then
  echo "❌ MUTANT SURVIVED: Test passed but should have failed"
  cat /tmp/mutant-output.txt
  exit 1
else
  echo "✅ MUTANT KILLED: Test failed as expected"
  echo ""
  echo "Failure output:"
  grep -A 2 "endedEarly = true" /tmp/mutant-output.txt || cat /tmp/mutant-output.txt | tail -10
  exit 0
fi
