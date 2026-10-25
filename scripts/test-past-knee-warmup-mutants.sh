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

set -e

WARMUP_FILE="src/lib/program/warmup.ts"
BACKUP=$(mktemp)
trap "mv \"$BACKUP\" \"$WARMUP_FILE\" 2>/dev/null || true; rm -f \"$BACKUP\" 2>/dev/null || true" EXIT

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
  if ! npx tsc --noEmit 2>&1 | head -20; then
    echo "✓ KILLED by TypeScript (does not compile)"
    KILLED=$((KILLED + 1))
    return
  fi
  
  # Run past-knee warmup test
  if npm run test:past-knee-warmup > /dev/null 2>&1; then
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
  "sed -i.bak '/Past-knee exclusion: exclude knee-loading mobility drills/,+3d' \"$WARMUP_FILE\""

# Mutant (b): Remove fallback exclusion
test_mutant "Remove fallback exclusion" \
  "sed -i.bak '/Past-knee exclusion: skip knee-loading fallbacks/,+3d' \"$WARMUP_FILE\""

# Mutant (c): Apply exclusion to all users (remove isPastKnee condition)
test_mutant "Apply exclusion to all users" \
  "sed -i.bak 's/if (isPastKnee && PAST_KNEE_EXCLUDED_WARMUP_SLUGS/if (PAST_KNEE_EXCLUDED_WARMUP_SLUGS/g' \"$WARMUP_FILE\""

# Mutant (d): Treat current knee as past knee (change the condition)
# EQUIVALENT: current knee already excludes these through target_regions
test_mutant "Treat current knee as past knee" \
  "sed -i.bak 's/const isPastKnee = prehabRegionSet.has(\"knee\") && !regions.has(\"knee\")/const isPastKnee = prehabRegionSet.has(\"knee\")/' \"$WARMUP_FILE\"" \
  "true"

# Mutant (e): Drop worlds-greatest from the excluded set
test_mutant "Drop worlds-greatest from excluded set" \
  "sed -i.bak '/\"worlds-greatest\",/d' \"$WARMUP_FILE\""

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
