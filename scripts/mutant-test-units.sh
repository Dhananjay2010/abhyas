#!/usr/bin/env bash
set -e

# Mutant test: Kill unit formatting in progression messages
# If displayWeight doesn't use formatWeight for imperial, this should pass the mutant (bad)

echo "Mutant: Kill unit formatting (imperial should become kg)"

# Backup
cp src/lib/program/progression.ts /tmp/progression-mutant-units.ts.bak

# Mutant: Remove imperial formatting, always return kg
sed -i 's/? formatWeight(kg, "imperial", true, "0 lb")/? `${kg} kg`/' src/lib/program/progression.ts

# Run imperial test - should FAIL with mutant
if npx tsx scripts/test-units-progression-imperial.ts 2>&1 | grep -q "All imperial units tests passed"; then
  echo "❌ MUTANT SURVIVED: Imperial messages still passed without formatWeight"
  cp /tmp/progression-mutant-units.ts.bak src/lib/program/progression.ts
  exit 1
else
  echo "✅ MUTANT KILLED: Test failed as expected"
fi

# Restore
cp /tmp/progression-mutant-units.ts.bak src/lib/program/progression.ts
echo "✓ Restored original code"
