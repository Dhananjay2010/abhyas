#!/bin/bash
set -e

# Test knee-volume mutants: apply mutations and verify tests catch them
# Exit 1 if any mutant survives or if any mutation is a no-op

GENERATE_FILE="src/lib/program/generate.ts"
KNEE_SAFETY_FILE="src/lib/program/knee-safety.ts"
BACKUP_GENERATE="/tmp/generate-backup-$$.ts"
BACKUP_KNEE_SAFETY="/tmp/knee-safety-backup-$$.ts"

# Trap to restore files
function cleanup {
  [ -f "$BACKUP_GENERATE" ] && cp "$BACKUP_GENERATE" "$GENERATE_FILE" && rm "$BACKUP_GENERATE"
  [ -f "$BACKUP_KNEE_SAFETY" ] && cp "$BACKUP_KNEE_SAFETY" "$KNEE_SAFETY_FILE" && rm "$BACKUP_KNEE_SAFETY"
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
     npm run test:knee-volume-identity 2>&1 | grep -q "✓ Identity test passed"; then
    echo "SURVIVOR: Tests passed (mutant not killed)"
    cleanup
    exit 1
  else
    echo "KILLED: Tests failed as expected"
    KILLED=$((KILLED + 1))
  fi
}

# Mutant 1: Remove past-knee lunge ranking preference
test_mutant "drop-past-knee-lunge-ranking" \
  "sed -i '/if (hasPastKnee && !PAST_KNEE_LUNGE_EXERCISES.has(ex.slug))/,/^    }/d' $GENERATE_FILE"

# Mutant 2: Remove knee-risk filter in normal patterns/fallback
test_mutant "remove-knee-filter-pickforslot" \
  "sed -i '/PART A: Knee-risk filter for knee users (Brief knee-volume)/,/^    }/d' $GENERATE_FILE"

# Mutant 3: Remove knee-risk filter in SAFE_ALTERNATIVES
test_mutant "remove-knee-filter-alternatives" \
  "sed -i '/PART A: Knee-risk filter for SAFE_ALTERNATIVES/,/^    }/d' $GENERATE_FILE"

# Mutant 4: Remove M3 Strategy 1 knee filter
test_mutant "remove-strategy1-knee-filter" \
  "sed -i '/.filter({ ex }) => {/,/});/s/if (!input.anyKneeInjury) return true;/return true;/' $GENERATE_FILE"

# Mutant 5: Remove M3 Strategy 2 knee filter
test_mutant "remove-strategy2-knee-filter" \
  "sed -i '0,/.filter({ ex }) => {/{n; s/if (!input.anyKneeInjury) return true;/return true;/}' $GENERATE_FILE"

# Mutant 6: Remove M3 Strategy 3 knee filter
test_mutant "remove-strategy3-knee-filter" \
  "sed -i '/if (input.anyKneeInjury) {/,/^          }/d' $GENERATE_FILE | head -c0"

# Mutant 7: Helper always returns false (ignores all contraindications)
test_mutant "helper-always-false" \
  "sed -i 's/const allContraindications = /return false; const allContraindications = /' $KNEE_SAFETY_FILE"

# Mutant 8: Helper ignores derived contraindications
test_mutant "helper-ignores-derived" \
  "sed -i 's/getDerivedContraindications(ex)/[]/' $KNEE_SAFETY_FILE"

# Mutant 9: Helper ignores anyKneeInjury gate
test_mutant "helper-ignores-gate" \
  "sed -i 's/if (!anyKneeInjury) return false;/\\/\\/ gate removed/' $KNEE_SAFETY_FILE"

echo ""
echo "=== RESULT: $KILLED/$TOTAL killed ==="

if [ $KILLED -eq $TOTAL ]; then
  echo "✓ All mutants killed"
  exit 0
else
  echo "✗ Some mutants survived"
  exit 1
fi
