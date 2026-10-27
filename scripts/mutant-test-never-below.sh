#!/usr/bin/env bash
set -e

# Mutant test: Kill never-below-lifted guard
# If we remove the "next <= from" check, off-grid weights could be floor-snapped below lifted weight

echo "Mutant: Kill never-below-lifted guard"

# Backup
cp src/lib/program/progression.ts /tmp/progression-mutant-below.ts.bak

# Find the guard and comment it out
# The guard is: if (next <= from) { return { ... hold ... } }
# We'll change the condition to always false

sed -i 's/if (next <= from) {/if (false \&\& next <= from) {/' src/lib/program/progression.ts

# Run never-below test - should FAIL with mutant
if npx tsx scripts/test-never-below-lifted.ts 2>&1 | grep -q "All never-below-lifted tests passed"; then
  echo "❌ MUTANT SURVIVED: Tests still passed without never-below guard"
  cp /tmp/progression-mutant-below.ts.bak src/lib/program/progression.ts
  exit 1
else
  echo "✅ MUTANT KILLED: Test failed as expected"
fi

# Restore
cp /tmp/progression-mutant-below.ts.bak src/lib/program/progression.ts
echo "✓ Restored original code"
