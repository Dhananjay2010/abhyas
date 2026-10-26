#!/usr/bin/env bash
# M3 mutant test: Skip lb-to-kg conversion in History edit save

set -euo pipefail

echo "M3 Mutant: Skip lb-to-kg conversion in History edit save"
echo "=========================================================="
echo ""

# Save original file
cp src/app/history/[id]/edit-sets.tsx /tmp/edit-sets.original.tsx

# Mutant: Remove the conversion by deleting the entire if block
# Original (lines 65-69):
#   if (field === "weight_kg" && numValue !== null) {
#     const kgValue = displayToKg(numValue, units);
#     numValue = kgValue;
#   }
# Mutant: Delete the conversion block
perl -i -pe 'BEGIN{undef $/;} s/if \(field === "weight_kg" && numValue !== null\) \{\s*const kgValue = displayToKg\(numValue, units\);\s*numValue = kgValue;\s*\}/\/\/ Mutant: conversion removed/' src/app/history/[id]/edit-sets.tsx

echo "Applied mutant: Commented out displayToKg conversion"
echo ""

# Run the test (should FAIL)
if npm run test:units-history-edit-save-path 2>&1; then
  echo ""
  echo "❌ MUTANT SURVIVED: Test passed when it should have failed!"
  mv /tmp/edit-sets.original.tsx src/app/history/[id]/edit-sets.tsx
  exit 1
else
  echo ""
  echo "✓ MUTANT KILLED: Test correctly failed"
  echo ""
fi

# Restore original
mv /tmp/edit-sets.original.tsx src/app/history/[id]/edit-sets.tsx

echo "Original file restored"
echo ""
echo "✅ M3 mutant test PASSED: Conversion is tested"
