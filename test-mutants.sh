#!/bin/bash
set -e

echo "=== Testing Hand Mutants ==="
echo ""

# M1 Mutant: Revert held weight to use floor instead of nearest
echo "M1: Revert isPrescription logic to always floor"
git stash
sed -i 's/isPrescribedIncrease/false/g' src/app/session/[id]/session-runner.tsx
echo "Running test:units-m1-held-weight-nearest..."
if npm run test:units-m1-held-weight-nearest 2>&1 | grep -q "All M1 tests passed"; then
  echo "✗ SURVIVED - test passed with mutant"
  exit 1
else
  echo "✓ KILLED - test failed as expected"
fi
git checkout src/app/session/[id]/session-runner.tsx

# L2 Mutant: Revert numeric comparison to text comparison
echo ""
echo "L2: Revert numeric comparison to text comparison"
sed -i 's/Number(weight) === Number(initialPrefill)/weight === initialPrefill/g' src/lib/units.ts
echo "Running test:units-l2-numeric-comparison..."
if npm run test:units-l2-numeric-comparison 2>&1 | grep -q "All L2 tests passed"; then
  echo "✗ SURVIVED - test passed with mutant"
  exit 1
else
  echo "✓ KILLED - test failed as expected"
fi
git checkout src/lib/units.ts

# M2/L3 Mutant: Revert metric to 0.25 grid
echo ""
echo "M2/L3: Revert metric to 0.25 kg grid"
sed -i 's/Math.round(kg \* 100) \/ 100/Math.round(kg * 4) \/ 4/g' src/lib/units.ts
echo "Running test:units-m2-metric-exact-2dp..."
if npm run test:units-m2-metric-exact-2dp 2>&1 | grep -q "All M2/L3 tests passed"; then
  echo "✗ SURVIVED - test passed with mutant"
  exit 1
else
  echo "✓ KILLED - test failed as expected"
fi
git checkout src/lib/units.ts

# L-c Mutant: Revert chart axis to always use formatWeight
echo ""
echo "L-c: Revert chart axis to always use formatWeight"
sed -i 's/if (isBodyWeight) {/if (false) {/g' src/components/charts.tsx
echo "Running test:units-lc-chart-axis-precision..."
if npm run test:units-lc-chart-axis-precision 2>&1 | grep -q "All L-c tests passed"; then
  echo "✗ SURVIVED - test passed with mutant"
  exit 1
else
  echo "✓ KILLED - test failed as expected"
fi
git checkout src/components/charts.tsx

# O1 Mutant: Revert bodyweight label to regular weight
echo ""
echo "O1: Revert bodyweight label to regular Weight"
sed -i "s/isBodyweight/false/g" src/app/session/[id]/session-runner.tsx
echo "Running test:units-o1-bodyweight-label..."
if npm run test:units-o1-bodyweight-label 2>&1 | grep -q "All O1 tests passed"; then
  echo "✗ SURVIVED - test passed with mutant"
  exit 1
else
  echo "✓ KILLED - test failed as expected"
fi
git checkout src/app/session/[id]/session-runner.tsx

git stash pop 2>/dev/null || true

echo ""
echo "=== All mutants killed successfully ==="
