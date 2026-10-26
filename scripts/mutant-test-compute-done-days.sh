#!/bin/bash
# Mutant test: isDone = false and verify test fails.

set -e

MUTANT_FILE="src/lib/today/compute-done-days.ts"
BACKUP="$MUTANT_FILE.mutant-backup"
TEST="scripts/test-compute-done-days.ts"

echo "Mutant test: isDone = false"

# Backup original
cp "$MUTANT_FILE" "$BACKUP"
trap "mv '$BACKUP' '$MUTANT_FILE'" EXIT

# Kill the logic: always return empty set
sed -i 's/done\.add(s\.local_date);/\/\/ done.add(s.local_date); \/\/ MUTANT KILLED/' "$MUTANT_FILE"

# Run test - should FAIL
echo "Running test against mutant..."
if npx tsx "$TEST" > /dev/null 2>&1; then
  echo "❌ MUTANT SURVIVED: Test passed when isDone was always false"
  exit 1
fi

# Get first FAIL line
npx tsx "$TEST" 2>&1 | grep "✗" | head -1

echo "✓ MUTANT KILLED by exit code"
exit 0
