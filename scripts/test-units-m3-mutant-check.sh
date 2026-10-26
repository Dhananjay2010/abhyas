#!/usr/bin/env bash
# M3 mutant: Skip displayToKg in History edit handleSetChange

set -euo pipefail

echo "M3 Mutant Test: Skip lb-to-kg conversion in History edit"
echo "==========================================================="
echo ""

# Save original
cp src/app/history/[id]/edit-sets.tsx /tmp/edit-sets.backup.tsx

# Apply mutant: Remove the displayToKg conversion
sed -i '/if (field === "weight_kg" && numValue !== null) {/,/}/c\
    \/\/ Mutant: Skip displayToKg conversion\
    if (field === "weight_kg" && numValue !== null) {\
      \/\/ numValue stays as entered (no conversion)\
    }' src/app/history/[id]/edit-sets.tsx

echo "Applied mutant: Commented out displayToKg call and assignment"
echo ""
echo "Running test..."
echo ""

# Run the test (should FAIL)
if npx tsx scripts/test-units-m3-history-save-real-path.tsx 2>&1; then
  echo ""
  echo "❌ MUTANT SURVIVED: Test passed when it should have failed!"
  mv /tmp/edit-sets.backup.tsx src/app/history/[id]/edit-sets.tsx
  exit 1
else
  EXITCODE=$?
  echo ""
  echo "✓ MUTANT KILLED: Test failed as expected (exit code: $EXITCODE)"
  echo ""
fi

# Restore original
mv /tmp/edit-sets.backup.tsx src/app/history/[id]/edit-sets.tsx

echo "Original file restored"
echo ""
echo "✅ M3 mutant test PASSED: Conversion is required"
