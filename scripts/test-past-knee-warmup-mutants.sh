#!/usr/bin/env bash
# Past-knee warm-up mutant testing
# 
# Verifies that the tests catch all critical bugs by introducing deliberate
# mutations and ensuring npm test fails for each one.
#
# Exit 1 if any mutant survives (test passes when it should fail) or is skipped.
# Exit 0 if all non-equivalent mutants are killed.
# "Does not compile" kills the mutant (TypeScript caught it, which is good).
#
# npm run test:past-knee-warmup-mutants

set -eo pipefail

WARMUP_FILE="src/lib/program/warmup.ts"
BACKUP=$(mktemp)
trap "cp \"$BACKUP\" \"$WARMUP_FILE\" 2>/dev/null || true; rm -f \"$BACKUP\" 2>/dev/null || true" EXIT

if [[ ! -f "$WARMUP_FILE" ]]; then
  echo "ERROR: $WARMUP_FILE not found"
  exit 1
fi

cp "$WARMUP_FILE" "$BACKUP"

SURVIVORS=0
KILLED=0
SKIPPED=0
EQUIVALENT=0

function test_mutant() {
  local name="$1"
  local mutation="$2"
  local is_equivalent="${3:-false}"
  
  echo ""
  echo "==================================="
  echo "Mutant: $name"
  echo "==================================="
  
  if [[ "$is_equivalent" == "true" ]]; then
    echo "✓ EQUIVALENT (current knee already excludes these via target_regions)"
    EQUIVALENT=$((EQUIVALENT + 1))
    return
  fi
  
  # Restore original
  cp "$BACKUP" "$WARMUP_FILE"
  
  # Apply mutation
  if ! eval "$mutation"; then
    echo "✗ SKIP: Mutation command failed"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  # Check if it compiles
  if ! npx tsc --noEmit 2>&1; then
    echo "✓ KILLED by TypeScript (does not compile)"
    KILLED=$((KILLED + 1))
    return
  fi
  
  # Run all past-knee warmup tests
  if npm run test:past-knee-warmup > /dev/null 2>&1 && \
     npm run test:past-knee-warmup-identity > /dev/null 2>&1 && \
     npm run test:past-knee-real-day > /dev/null 2>&1; then
    echo "✗ SURVIVOR: Tests passed but should have failed!"
    echo "  This mutant was not caught by the tests"
    SURVIVORS=$((SURVIVORS + 1))
  else
    echo "✓ KILLED by tests"
    KILLED=$((KILLED + 1))
  fi
}

# Mutant (a): Remove mobility pool exclusion
test_mutant "Remove mobility pool exclusion" \
  "sed -i.bak '/Past-knee exclusion: exclude knee-loading mobility drills/,+3d' \"$WARMUP_FILE\" && rm -f \"${WARMUP_FILE}.bak\""

# Mutant (b): Add bodyweight-squat to past-knee fallback list (before glute-bridge)
test_mutant "Add knee-loading drill to past-knee fallback" \
  "sed -i.bak 's/\\[\"glute-bridge\",/[\"bodyweight-squat\", \"glute-bridge\",/' \"$WARMUP_FILE\" && rm -f \"${WARMUP_FILE}.bak\""

# Mutant (c): Apply exclusion to all users (remove isPastKnee condition)
test_mutant "Apply exclusion to all users" \
  "sed -i.bak 's/if (isPastKnee && PAST_KNEE_EXCLUDED_WARMUP_SLUGS/if (PAST_KNEE_EXCLUDED_WARMUP_SLUGS/g' \"$WARMUP_FILE\" && rm -f \"${WARMUP_FILE}.bak\""

# Mutant (d): Treat current knee as past knee (change the condition)
# EQUIVALENT: current knee already excludes these through target_regions
test_mutant "Treat current knee as past knee" \
  "sed -i.bak 's/function isPastKneeUser/function isPastKneeUser_mutated/' \"$WARMUP_FILE\" && rm -f \"${WARMUP_FILE}.bak\"" \
  "true"

# Mutant (e): Drop worlds-greatest from the excluded set
test_mutant "Drop worlds-greatest from excluded set" \
  "sed -i.bak '/\"worlds-greatest\",/d' \"$WARMUP_FILE\" && rm -f \"${WARMUP_FILE}.bak\""

# Mutant (f): Remove the 3-drill limit check (allow overrun)
test_mutant "Remove 3-drill limit in fallback" \
  "sed -i.bak '/if (mobility.length >= 3)/d' \"$WARMUP_FILE\" && rm -f \"${WARMUP_FILE}.bak\""

# Restore original
cp "$BACKUP" "$WARMUP_FILE"

echo ""
echo "==================================="
echo "Mutant Testing Summary"
echo "==================================="
echo "Killed: $KILLED"
echo "Survivors: $SURVIVORS"
echo "Equivalent: $EQUIVALENT"
echo "Skipped: $SKIPPED"
echo ""

if [[ $SURVIVORS -gt 0 ]]; then
  echo "✗ FAIL: $SURVIVORS mutant(s) survived"
  exit 1
elif [[ $SKIPPED -gt 0 ]]; then
  echo "✗ FAIL: $SKIPPED mutant(s) skipped (mutation command failed)"
  exit 1
else
  echo "✓ SUCCESS: All non-equivalent mutants killed"
  exit 0
fi
