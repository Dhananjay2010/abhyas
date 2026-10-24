#!/usr/bin/env bash
# Mutation testing for PR #73 knee-safe quad allowlist
# Verifies that critical safety checks are tested

set -e

FILE="src/lib/program/generate.ts"
MATRIX_TEST="npm run test:knee-safety-matrix"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Mutation Testing for PR #73"
echo "───────────────────────────────────────────────────────────"
echo

# Track results
TOTAL=0
KILLED=0
SURVIVED=0

# Helper function to run a mutant test
test_mutant() {
  local desc="$1"
  local search="$2"
  local replace="$3"
  local expected_pass_count="$4"
  
  TOTAL=$((TOTAL + 1))
  echo -e "${YELLOW}Mutant $TOTAL:${NC} $desc"
  
  # Create backup
  cp "$FILE" "$FILE.backup"
  
  # Apply mutation
  if ! sed -i "s/$search/$replace/g" "$FILE"; then
    echo -e "  ${RED}✗ Failed to apply mutation${NC}"
    mv "$FILE.backup" "$FILE"
    SURVIVED=$((SURVIVED + 1))
    return
  fi
  
  # Verify mutant compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo -e "  ${RED}✗ Mutant does not compile (not counted)${NC}"
    mv "$FILE.backup" "$FILE"
    return
  fi
  
  # Run matrix test
  set +e
  OUTPUT=$($MATRIX_TEST 2>&1)
  EXIT_CODE=$?
  set -e
  
  # Restore original
  mv "$FILE.backup" "$FILE"
  
  # Check result
  PASS_COUNT=$(echo "$OUTPUT" | grep -oP 'tested \K\d+(?= profiles, \d+ passed)' | head -1)
  
  if [ "$EXIT_CODE" -ne 0 ] && [ "$PASS_COUNT" = "$expected_pass_count" ]; then
    echo -e "  ${GREEN}✓ Killed${NC} (test failed as expected, $PASS_COUNT failed)"
    KILLED=$((KILLED + 1))
  else
    echo -e "  ${RED}✗ Survived${NC} (test passed or wrong failure count: $PASS_COUNT)"
    SURVIVED=$((SURVIVED + 1))
  fi
  
  echo
}

# Mutant 1: Add box-squat to allowlist (should be caught by matrix)
test_mutant \
  "Add box-squat to KNEE_SAFE_QUAD_EXERCISES" \
  "KNEE_SAFE_QUAD_EXERCISES = new Set" \
  "KNEE_SAFE_QUAD_EXERCISES = new Set([\"box-squat\"]); const X = new Set" \
  "2592"

# Mutant 2: Disable wouldViolateConstraints (should fail matrix)
test_mutant \
  "wouldViolateConstraints always returns false" \
  "function wouldViolateConstraints" \
  "function wouldViolateConstraints() { return false; } function x" \
  "2592"

# Mutant 3: Disable knee-safe allowlist check in isEligible
test_mutant \
  "Remove knee-safe allowlist check" \
  "if (!KNEE_SAFE_QUAD_EXERCISES.has(candidate.slug)) return false;" \
  "if (false) return false; \/\/ MUTANT" \
  "2592"

# Mutant 4: Disable beginner high-impact ban
test_mutant \
  "Allow beginners to do high-impact exercises" \
  "if (input.level === \"beginner\" && candidate.impact === \"high\") return false;" \
  "if (false) return false; \/\/ MUTANT beginner high-impact" \
  "2592"

# Mutant 5: Treat past knee as not-knee (should pass on this branch, fail on main)
test_mutant \
  "Past knee not included in selection regions" \
  'else if (injury.severity === "past" && injury.region === "knee")' \
  'else if (false) \/\/ MUTANT past knee' \
  "2592"

# Mutant 6: Remove cable-deadlifts from floor-pull exclusion
test_mutant \
  "Remove cable-deadlifts from FLOOR_PULL_DEADLIFTS" \
  '"cable-deadlifts",' \
  '\/\/ MUTANT: "cable-deadlifts",' \
  "2592"

# Mutant 7: Remove kettlebell-one-legged-deadlift from floor-pull exclusion
test_mutant \
  "Remove kettlebell-one-legged-deadlift from exclusion" \
  '"kettlebell-one-legged-deadlift",' \
  '\/\/ MUTANT: "kettlebell-one-legged-deadlift",' \
  "2592"

# Mutant 8: Skip lower-body filling logic
test_mutant \
  "Skip thin leg day fix (lower-body filling)" \
  'if (nonCoreLowerCount < 2)' \
  'if (false) \/\/ MUTANT leg fill' \
  "2592"

# Summary
echo "───────────────────────────────────────────────────────────"
echo -e "Mutation testing complete"
echo -e "  Total mutants: $TOTAL"
echo -e "  ${GREEN}Killed: $KILLED${NC}"
echo -e "  ${RED}Survived: $SURVIVED${NC}"
echo

if [ "$SURVIVED" -gt 0 ]; then
  echo -e "${RED}FAIL: $SURVIVED mutant(s) survived${NC}"
  exit 1
else
  echo -e "${GREEN}PASS: All mutants killed${NC}"
  exit 0
fi
