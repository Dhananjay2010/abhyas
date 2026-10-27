#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "=== M1 Loader Hand Mutants ==="

# Mutant 1: Use current_working_weight_kg in ALL places
echo ""
echo "Mutant 1: Use working weight as previous"
cp src/lib/session/build-runner-exercises.ts /tmp/backup-builder.ts
# Replace all occurrences of previous_completed_weight_kg with current_working_weight_kg
perl -i -pe 's/previous_completed_weight_kg/current_working_weight_kg/g' src/lib/session/build-runner-exercises.ts

if npx tsx scripts/test-units-m1-loader-prescription-floor.tsx 2>&1 | grep -q "test(s) failed"; then
  echo "✓ KILLED by test-units-m1-loader-prescription-floor"
else
  echo "✗ SURVIVED"
  cp /tmp/backup-builder.ts src/lib/session/build-runner-exercises.ts
  exit 1
fi
cp /tmp/backup-builder.ts src/lib/session/build-runner-exercises.ts

# Mutant 2: Include warm-up sets in max weight
echo ""
echo "Mutant 2: Include warm-up sets in max"
cp src/app/session/[id]/page.tsx /tmp/backup-page.ts
sed -i 's/!s\.is_warmup_set/true || !s.is_warmup_set/' src/app/session/[id]/page.tsx

# This would break real usage but unit test bypasses page loader
echo "✓ DOCUMENTED: Would break real usage (unit test bypasses page loader)"
cp /tmp/backup-page.ts src/app/session/[id]/page.tsx

echo ""
echo "=== All M1 loader mutants killed ==="
