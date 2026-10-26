#!/bin/bash
set -e

echo "=== Progress empty state mutant testing ==="

# Baseline: tests must pass with real code
echo "Running baseline check..."
npm run test:progress-empty-state > /dev/null 2>&1 || {
  echo "ERROR: Baseline tests failed. Tests must pass before mutant testing."
  exit 1
}
echo "✓ Baseline passed"

# Mutant 1: Remove hasAnyProgressData check (always show data, never empty state)
echo ""
echo "Mutant 1: Remove hasAnyProgressData check (force showing data)"
TEMP_FILE=$(mktemp)
cp src/app/progress/page.tsx "$TEMP_FILE"

sed -i 's/!hasAnyProgressData/false/' src/app/progress/page.tsx

if npm run test:progress-empty-state > /dev/null 2>&1; then
  echo "✗ SURVIVED: Mutant 1 was not killed (tests still pass)"
  cp "$TEMP_FILE" src/app/progress/page.tsx
  rm "$TEMP_FILE"
  exit 1
else
  echo "✓ KILLED: Mutant 1 was killed (tests failed as expected)"
fi

cp "$TEMP_FILE" src/app/progress/page.tsx
rm "$TEMP_FILE"

# Mutant 2: Invert the condition (show empty when there IS data)
echo ""
echo "Mutant 2: Invert condition (show empty when data exists)"
TEMP_FILE2=$(mktemp)
cp src/app/progress/page.tsx "$TEMP_FILE2"

sed -i 's/!hasAnyProgressData && !progressQueryFailed/hasAnyProgressData || progressQueryFailed/' src/app/progress/page.tsx

if npm run test:progress-empty-state > /dev/null 2>&1; then
  echo "✗ SURVIVED: Mutant 2 was not killed (tests still pass)"
  cp "$TEMP_FILE2" src/app/progress/page.tsx
  rm "$TEMP_FILE2"
  exit 1
else
  echo "✓ KILLED: Mutant 2 was killed (tests failed as expected)"
fi

cp "$TEMP_FILE2" src/app/progress/page.tsx
rm "$TEMP_FILE2"

echo ""
echo "=== All mutants killed ==="
