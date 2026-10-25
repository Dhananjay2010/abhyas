#!/bin/bash
# Mutant test: Remove wall-sit demotion logic and verify test fails

set -e

MUTANT_FILE="src/lib/program/alternatives.ts"
BACKUP_FILE="${MUTANT_FILE}.backup-wall-sit-mutant"

# Backup original
cp "$MUTANT_FILE" "$BACKUP_FILE"

cleanup() {
  # Restore original
  mv "$BACKUP_FILE" "$MUTANT_FILE"
}

trap cleanup EXIT

echo "Running wall-sit demotion mutant test..."

# Mutant: Remove the wall-sit demotion block
sed -i '/QA Steer (k): Demote wall-sit/,/^  }$/d' "$MUTANT_FILE"

echo "Mutant applied: Removed wall-sit demotion logic"

# Run the test - should FAIL
if npm run test:past-knee-wall-sit-demotion > /dev/null 2>&1; then
  echo "❌ MUTANT SURVIVED: Test should have failed but passed"
  exit 1
else
  echo "✓ Mutant killed: Test correctly failed"
fi

echo "✅ Wall-sit demotion mutant test passed"
