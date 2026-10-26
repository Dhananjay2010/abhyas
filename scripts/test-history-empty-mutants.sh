#!/bin/bash
set -e

echo "=== History empty states mutant testing ==="

# Baseline: tests must pass with real code
echo "Running baseline check..."
npm run test:history-empty-states > /dev/null 2>&1 || {
  echo "ERROR: Baseline tests failed. Tests must pass before mutant testing."
  exit 1
}
echo "✓ Baseline passed"

# Mutant 1: Force totalCount check to always treat as filtered (never show true empty)
echo ""
echo "Mutant 1: Force isEmpty=false (totalCount > 0 branch)"
TEMP_FILE=$(mktemp)
cp src/app/history/history-client.tsx "$TEMP_FILE"

sed -i 's/totalCount === 0/false/' src/app/history/history-client.tsx

if npm run test:history-empty-states > /dev/null 2>&1; then
  echo "✗ SURVIVED: Mutant 1 was not killed (tests still pass)"
  cp "$TEMP_FILE" src/app/history/history-client.tsx
  rm "$TEMP_FILE"
  exit 1
else
  echo "✓ KILLED: Mutant 1 was killed (tests failed as expected)"
fi

cp "$TEMP_FILE" src/app/history/history-client.tsx
rm "$TEMP_FILE"

# Mutant 2: Remove filtered empty state (always show true empty)
echo ""
echo "Mutant 2: Remove filtered empty branch (always show true empty)"
TEMP_FILE2=$(mktemp)
cp src/app/history/history-client.tsx "$TEMP_FILE2"

# Replace the totalCount conditional with just the true empty state
sed -i '/totalCount === 0 ?/,/Clear filters/c\          <div className="mt-8 rounded-xl border border-dashed border-border px-5 py-12 text-center">\n            <p className="text-sm font-medium text-foreground">No completed sessions yet</p>\n            <p className="mt-2 text-sm text-muted">\n              Your workout history will appear here once you complete your first session.\n            </p>\n          </div>' src/app/history/history-client.tsx

if npm run test:history-empty-states > /dev/null 2>&1; then
  echo "✗ SURVIVED: Mutant 2 was not killed (tests still pass)"
  cp "$TEMP_FILE2" src/app/history/history-client.tsx
  rm "$TEMP_FILE2"
  exit 1
else
  echo "✓ KILLED: Mutant 2 was killed (tests failed as expected)"
fi

cp "$TEMP_FILE2" src/app/history/history-client.tsx
rm "$TEMP_FILE2"

echo ""
echo "=== All mutants killed ==="
