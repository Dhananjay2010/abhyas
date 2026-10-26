#!/bin/bash
# Mutant test: Set row.loggedSets = undefined and verify test fails.

set -e

MUTANT_FILE="src/lib/today/wire-logged-sets.ts"
BACKUP="$MUTANT_FILE.mutant-backup"
TEST="scripts/test-wire-logged-sets.ts"

echo "Mutant test: row.loggedSets = undefined"

# Backup original
cp "$MUTANT_FILE" "$BACKUP"
trap "mv '$BACKUP' '$MUTANT_FILE'" EXIT

# Kill the wiring: comment out the assignment
sed -i 's/row\.loggedSets = formatted;/\/\/ row.loggedSets = formatted; \/\/ MUTANT KILLED/' "$MUTANT_FILE"

# Run test - should FAIL
echo "Running test against mutant..."
if npx tsx "$TEST" > /dev/null 2>&1; then
  echo "❌ MUTANT SURVIVED: Test passed when row.loggedSets assignment was removed"
  exit 1
fi

# Get first FAIL line
npx tsx "$TEST" 2>&1 | grep "✗" | head -1

echo "✓ MUTANT KILLED by exit code"
exit 0
