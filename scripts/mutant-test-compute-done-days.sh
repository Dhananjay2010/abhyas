#!/bin/bash
# Mutant test: Set isDone = false in page.tsx

set -e

MUTANT_FILE="src/app/today/page.tsx"
BACKUP="$MUTANT_FILE.mutant-backup"
TEST="scripts/test-wire-logged-sets.ts"

echo "Mutant test: Force isDone = false"

# Backup original
cp "$MUTANT_FILE" "$BACKUP"
trap "mv '$BACKUP' '$MUTANT_FILE'" EXIT

# Baseline: test must pass
echo "Running baseline test..."
if ! npm run test:wire-logged-sets > /dev/null 2>&1; then
  echo "❌ Baseline test failed"
  exit 1
fi
echo "✓ Baseline passed"

# Kill: replace the whole isDayDone call with false
sed -i 's/isDone: isDayDone(completedDays, localToday, todayIndex, dayIndex),/isDone: false,/g' "$MUTANT_FILE"

# Verify mutation applied
if grep -q "isDayDone(completedDays, localToday, todayIndex, dayIndex)" "$MUTANT_FILE"; then
  echo "❌ Mutation did not apply - isDayDone call still present"
  exit 1
fi
echo "✓ Mutation applied"

# Run test - should FAIL
echo "Running test against mutant..."
if npm run test:wire-logged-sets > /dev/null 2>&1; then
  echo "❌ MUTANT SURVIVED: Test passed when isDone was forced to false"
  exit 1
fi

# Get first FAIL line
npm run test:wire-logged-sets 2>&1 | grep -E "✗|FAIL|Error" | head -1

echo "✓ MUTANT KILLED by test failure"
exit 0
