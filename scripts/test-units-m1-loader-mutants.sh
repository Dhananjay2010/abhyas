#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "=== M1 Loader Mutants ==="

# Mutant 1: Return null instead of reading previous_completed_weight_kg
echo ""
echo "Mutant 1: Drop previous weight extraction"
cp src/lib/session/build-runner-exercises.ts /tmp/backup.ts
sed -i '/const previousCompleted = progress/,/: Number(progress.previous_completed_weight_kg);/c\  const previousCompleted = null;' src/lib/session/build-runner-exercises.ts

if npx tsx scripts/test-units-m1-loader-prescription-floor.tsx 2>&1 | tail -5 | grep -q "test(s) failed"; then
  echo "✓ KILLED by test-units-m1-loader-prescription-floor"
else
  echo "✗ SURVIVED"
  cp /tmp/backup.ts src/lib/session/build-runner-exercises.ts
  exit 1
fi
cp /tmp/backup.ts src/lib/session/build-runner-exercises.ts

echo ""
echo "=== All mutants killed ==="
