#!/bin/bash
set -e

# Test knee-volume mutants: apply mutations and verify tests catch them
# Exit 1 if any mutant survives or if any mutation is a no-op

GENERATE_FILE="src/lib/program/generate.ts"
KNEE_SAFETY_FILE="src/lib/program/knee-safety.ts"
BACKUP_GENERATE=$(mktemp "${TMPDIR:-/tmp}/generate-backup.XXXXXX")
BACKUP_KNEE_SAFETY=$(mktemp "${TMPDIR:-/tmp}/knee-safety-backup.XXXXXX")

# Trap to restore files
function cleanup {
  if [ -s "$BACKUP_GENERATE" ]; then
    cp "$BACKUP_GENERATE" "$GENERATE_FILE"
  fi
  rm -f "$BACKUP_GENERATE"
  if [ -s "$BACKUP_KNEE_SAFETY" ]; then
    cp "$BACKUP_KNEE_SAFETY" "$KNEE_SAFETY_FILE"
  fi
  rm -f "$BACKUP_KNEE_SAFETY"
}
trap cleanup EXIT

# Backup originals
cp "$GENERATE_FILE" "$BACKUP_GENERATE"
cp "$KNEE_SAFETY_FILE" "$BACKUP_KNEE_SAFETY"

TOTAL=0
KILLED=0

function test_mutant {
  local name="$1"
  local mutation="$2"
  
  TOTAL=$((TOTAL + 1))
  echo ""
  echo "=== Mutant $TOTAL: $name ==="
  
  # Restore originals
  cp "$BACKUP_GENERATE" "$GENERATE_FILE"
  cp "$BACKUP_KNEE_SAFETY" "$KNEE_SAFETY_FILE"
  
  # Apply mutation
  eval "$mutation"
  
  # Check if it compiles
  if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    echo "FAIL: Mutant does not compile"
    cleanup
    exit 1
  fi
  
  # Run tests
  if npm run test:knee-volume 2>&1 | grep -q "✓ All invariants passed" && \
     npm run test:knee-volume-identity 2>&1 | grep -q "✓ Identity test passed" && \
     npx tsx scripts/count-knee-risk-outside-squat.ts 2>&1 | grep -q "✓ PASS"; then
    echo "SURVIVOR: Tests passed (mutant not killed)"
    cleanup
    exit 1
  else
    echo "KILLED: Tests failed as expected"
    KILLED=$((KILLED + 1))
  fi
}

# Mutant 1: Disable knee-risk filter in pickForSlot (change hasPastKnee to false)
test_mutant "disable-pickforslot-knee-filter" \
  "sed -i '829s/input\\.anyKneeInjury/false/' $GENERATE_FILE"

# Mutant 2: Remove entire knee-risk filter block from pickForSlot
test_mutant "remove-pickforslot-knee-block" \
  "sed -i '/PART A: Knee-risk filter for PAST knee users/,/^    }/d' $GENERATE_FILE"

# Mutant 3: Remove knee-risk filter from SAFE_ALTERNATIVES
test_mutant "remove-alternatives-knee-block" \
  "sed -i '/PART A: Knee-risk filter for SAFE_ALTERNATIVES - past knee only/,/^    }/d' $GENERATE_FILE"

# Mutant 4: Make helper always return false
test_mutant "helper-always-false" \
  "sed -i '/export function isKneeRiskForKneeUser/,/^}/ s/if (!anyKneeInjury) {/if (true || !anyKneeInjury) {/' $KNEE_SAFETY_FILE"

# Mutant 5: Remove squat slot exception (change slotIndex !== 0 so Barbell Squat gets filtered from slot 0)
test_mutant "remove-squat-slot-exception" \
  "sed -i 's/slotIndex !== 0/slotIndex !== 999/g' $GENERATE_FILE"

echo ""
echo "=== RESULT: $KILLED/$TOTAL killed ==="

if [ $KILLED -eq $TOTAL ]; then
  echo "✓ All mutants killed"
  exit 0
else
  echo "✗ Some mutants survived"
  exit 1
fi
