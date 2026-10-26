#!/bin/bash
# Mutant test: Drop wireLoggedSets call in page.tsx

set -e

MUTANT_FILE="src/app/today/page.tsx"
BACKUP="$MUTANT_FILE.mutant-backup"
TEST="scripts/test-wire-logged-sets.ts"

echo "Mutant test: Drop wireLoggedSets call"

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

# Kill the call: comment out the wireLoggedSets invocation
sed -i 's/wireLoggedSets(todayExercises as unknown as Parameters<typeof wireLoggedSets>\[0\], loggedSetsRes.data, units);/\/\/ MUTANT: wireLoggedSets dropped/g' "$MUTANT_FILE"

# Verify mutation applied
if grep -q "wireLoggedSets(todayExercises" "$MUTANT_FILE"; then
  echo "❌ Mutation did not apply - wireLoggedSets call still present"
  exit 1
fi
echo "✓ Mutation applied"

# Run test - should FAIL
echo "Running test against mutant..."
if npm run test:wire-logged-sets > /dev/null 2>&1; then
  echo "❌ MUTANT SURVIVED: Test passed when wireLoggedSets call was dropped"
  exit 1
fi

# Get first FAIL line
npm run test:wire-logged-sets 2>&1 | grep -E "✗|FAIL|Error" | head -1

echo "✓ MUTANT KILLED by test failure"
exit 0
