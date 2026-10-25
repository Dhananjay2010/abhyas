#!/usr/bin/env bash
#
# Test 5: Mutant evidence test.
# Revert the fix and show that tests 1 and 4 fail.
#
#   bash scripts/test-today-rest-day-mutant.sh
#

set -euo pipefail

echo ""
echo "=== Mutant test: revert fix and verify test failures ==="
echo ""

# Save the current version
cp src/lib/today/should-load-plannable.ts src/lib/today/should-load-plannable.ts.backup

# Create the mutant: only load when askAboutToday is true
cat > src/lib/today/should-load-plannable.ts << 'EOF'
/**
 * MUTANT: only load plannable days when askAboutToday is true.
 * This should cause test failures for rest days.
 */
export function shouldLoadPlannableDays(params: {
  missedYesterday: boolean;
  strengthDone: boolean;
  strengthOpen: boolean;
  dayType: string | null;
}): boolean {
  const { missedYesterday, strengthDone, strengthOpen } = params;

  const askAboutToday = missedYesterday && !strengthDone && !strengthOpen;

  return askAboutToday;
}
EOF

echo "1. Running test:today-rest-day-strength-swap (should FAIL)"
echo ""
if npm run test:today-rest-day-strength-swap; then
  echo ""
  echo "❌ MUTANT FAILURE: Test 1 passed when it should have failed"
  cp src/lib/today/should-load-plannable.ts.backup src/lib/today/should-load-plannable.ts
  rm src/lib/today/should-load-plannable.ts.backup
  exit 1
else
  echo ""
  echo "✅ Test 1 failed as expected with mutant"
fi

echo ""
echo "2. Running test:today-rest-day-page-path (should FAIL)"
echo ""
if npm run test:today-rest-day-page-path; then
  echo ""
  echo "❌ MUTANT FAILURE: Test 4 passed when it should have failed"
  cp src/lib/today/should-load-plannable.ts.backup src/lib/today/should-load-plannable.ts
  rm src/lib/today/should-load-plannable.ts.backup
  exit 1
else
  echo ""
  echo "✅ Test 4 failed as expected with mutant"
fi

# Restore the original
cp src/lib/today/should-load-plannable.ts.backup src/lib/today/should-load-plannable.ts
rm src/lib/today/should-load-plannable.ts.backup

echo ""
echo "=== Mutant test complete: both tests failed as expected ==="
echo ""
