#!/bin/bash
set -e

# Test knee-volume mutants: apply mutations and verify tests catch them
# Exit 1 if any mutant survives or if any mutation is a no-op

GENERATE_FILE="src/lib/program/generate.ts"
KNEE_SAFETY_FILE="src/lib/program/knee-safety.ts"
BACKUP_GENERATE="/tmp/generate-backup-mutants.ts"
BACKUP_KNEE_SAFETY="/tmp/knee-safety-backup-mutants.ts"

# Trap to restore files
function cleanup {
  if [ -f "$BACKUP_GENERATE" ]; then
    cp "$BACKUP_GENERATE" "$GENERATE_FILE"
    rm "$BACKUP_GENERATE"
  fi
  if [ -f "$BACKUP_KNEE_SAFETY" ]; then
    cp "$BACKUP_KNEE_SAFETY" "$KNEE_SAFETY_FILE"
    rm "$BACKUP_KNEE_SAFETY"
  fi
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

# Mutant 1: Disable knee-risk filter in pickForSlot
test_mutant "disable-pickforslot-knee-filter" \
  "sed -i '827s/input\\.anyKneeInjury/false/' $GENERATE_FILE"

# Mutant 2: Remove entire knee-risk filter block from pickForSlot
test_mutant "remove-pickforslot-knee-block" \
  "sed -i '/PART A: Knee-risk filter for knee users (Brief knee-volume)/,/^    }/d' $GENERATE_FILE"

# Mutant 3: Remove knee-risk filter from SAFE_ALTERNATIVES
test_mutant "remove-alternatives-knee-block" \
  "sed -i '/PART A: Knee-risk filter for SAFE_ALTERNATIVES/,/^    }/d' $GENERATE_FILE"

# Mutant 4: Make helper always return false
test_mutant "helper-always-false" \
  "sed -i '/export function isKneeRiskForKneeUser/,/^}/ s/if (!anyKneeInjury) {/if (true || !anyKneeInjury) {/' $KNEE_SAFETY_FILE"

echo ""
echo "=== RESULT: $KILLED/$TOTAL killed ==="

if [ $KILLED -eq $TOTAL ]; then
  echo "✓ All mutants killed"
  exit 0
else
  echo "✗ Some mutants survived"
  exit 1
fi
