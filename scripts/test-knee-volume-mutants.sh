#!/bin/bash
set -e

# Test knee-volume mutants: apply mutations and verify tests catch them
# Exit 1 if any mutant survives or if any mutation is a no-op

GENERATE_FILE="src/lib/program/generate.ts"
BACKUP_FILE="/tmp/generate-backup-$$.ts"
MUTANT_FILE="/tmp/generate-mutant-$$.ts"

# Trap to restore file
function cleanup {
  if [ -f "$BACKUP_FILE" ]; then
    cp "$BACKUP_FILE" "$GENERATE_FILE"
    rm "$BACKUP_FILE"
  fi
  if [ -f "$MUTANT_FILE" ]; then
    rm "$MUTANT_FILE"
  fi
}
trap cleanup EXIT

# Backup original
cp "$GENERATE_FILE" "$BACKUP_FILE"
ORIGINAL_SHA=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)

TOTAL=0
KILLED=0

function test_mutant {
  local name="$1"
  local sed_cmd="$2"
  
  TOTAL=$((TOTAL + 1))
  echo ""
  echo "=== Mutant $TOTAL: $name ==="
  
  # Apply mutation
  cp "$BACKUP_FILE" "$MUTANT_FILE"
  eval "$sed_cmd" < "$BACKUP_FILE" > "$MUTANT_FILE"
  
  # Check if mutation actually changed the file
  MUTANT_SHA=$(sha256sum "$MUTANT_FILE" | cut -d' ' -f1)
  if [ "$MUTANT_SHA" = "$ORIGINAL_SHA" ]; then
    echo "SKIP: Mutation was a no-op"
    cleanup
    exit 1
  fi
  
  cp "$MUTANT_FILE" "$GENERATE_FILE"
  
  # Check if it compiles
  if ! npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    echo "Compiles: yes"
  else
    echo "FAIL: Mutant does not compile (must rewrite mutation)"
    cleanup
    exit 1
  fi
  
  # Run tests
  if npm run test:knee-volume 2>&1 | tail -10 && \
     npm run test:knee-volume-identity 2>&1 | tail -10; then
    echo "SURVIVOR: Tests passed (mutant not killed)"
    cleanup
    exit 1
  else
    echo "KILLED: Tests failed as expected"
    KILLED=$((KILLED + 1))
  fi
  
  # Restore original
  cp "$BACKUP_FILE" "$GENERATE_FILE"
}

# Mutant (a): Drop the PAST_KNEE_LUNGE_EXERCISES pre-fallback step
test_mutant "drop-past-knee-lunge-prefallback" \
  "sed '/PART A: Past-knee lunge slot fix/,/\/\/ Normal pattern\/fallback loop/d'"

# Mutant (b): Remove knee-risk filter from squat fallback
test_mutant "remove-knee-filter-fallback" \
  "sed '/PART A: Knee-risk filter for knee users in fallback patterns/,/if (candidates.length === 0) continue;/d'"

# Mutant (c): Remove knee-risk filter from SAFE_ALTERNATIVES loop
test_mutant "remove-knee-filter-alternatives" \
  "sed '/PART A: Knee-risk filter for knee users in SAFE_ALTERNATIVES/,/if (altCandidates.length === 0) continue;/d'"

# Mutant (d): Remove Strategy 2 knee skip
test_mutant "remove-strategy2-knee-skip" \
  "sed '/Knee users: skip knee-risk exercises/,/return true;/s/if (input.anyKneeInjury) {.*}/\/\/ mutant: removed knee check/' "

# Mutant (e): Remove Strategy 1 knee skip
test_mutant "remove-strategy1-knee-skip" \
  "sed '0,/Knee users: skip knee-risk exercises/{s/if (input.anyKneeInjury) {/if (false) {/}'"

# Mutant (f): Remove Strategy 3 knee filter
test_mutant "remove-strategy3-knee-filter" \
  "sed '/Knee users: exclude knee-risk exercises/,/candidates = candidates.sort/d'"

# Mutant (g): Helper ignores derived contraindications
test_mutant "helper-ignores-derived" \
  "sed -i 's/getDerivedContraindications(ex)/[]/' src/lib/program/knee-safety.ts && cat"

# Mutant (h): Helper ignores anyKneeInjury gate (must be killed by identity test)
test_mutant "helper-ignores-gate" \
  "sed -i 's/if (!anyKneeInjury) {/if (false) {/' src/lib/program/knee-safety.ts && cat"

# Mutant (i): Allow wall-sit first in main slots
test_mutant "allow-wall-sit-first-main" \
  "sed '/Prefer non-timed/,/const finalCandidates/s/isMainSlot/false/'"

echo ""
echo "=== RESULT: $KILLED/$TOTAL killed ==="

if [ $KILLED -eq $TOTAL ]; then
  exit 0
else
  exit 1
fi
