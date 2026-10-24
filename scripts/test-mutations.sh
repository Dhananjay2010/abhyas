#!/usr/bin/env bash
set -euo pipefail

echo "Mutation Testing for PR #73"
echo "=============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

FAILED=0
TOTAL=0

# Helper to run a mutation
test_mutation() {
  local name="$1"
  local file="$2"
  local search="$3"
  local replace="$4"
  
  TOTAL=$((TOTAL + 1))
  echo -n "[$TOTAL] Testing mutation: $name... "
  
  # Apply mutation
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/$search/$replace/g" "$file"
  else
    sed -i "s/$search/$replace/g" "$file"
  fi
  
  # Run tests and capture output and exit code
  OUTPUT=$(npm run test:knee-safety-matrix 2>&1 || true)
  EXIT_CODE=$?
  
  # Check for failures in output
  if echo "$OUTPUT" | grep -q "All tests passed!" && [ $EXIT_CODE -eq 0 ]; then
    echo -e "${RED}SURVIVED${NC} - mutation was not caught by tests!"
    FAILED=$((FAILED + 1))
  else
    echo -e "${GREEN}KILLED${NC}"
  fi
  
  # Revert mutation
  git checkout -- "$file"
}

# Mutation 1: Add box-squat to knee-safe allowlist
test_mutation \
  "Add box-squat to KNEE_SAFE_QUAD_EXERCISES" \
  "src/lib/program/generate.ts" \
  "'spanish-squat'," \
  "'spanish-squat', 'box-squat',"

# Mutation 2: Drop wouldViolateConstraints call (both instances)
test_mutation \
  "Remove wouldViolateConstraints check" \
  "src/lib/program/generate.ts" \
  "wouldViolateConstraints(e, i, pickedExercises, input)" \
  "false \/\/ MUTANT"

# Mutation 3: Remove compound-before-isolation sort
test_mutation \
  "Remove compound-before-isolation sort" \
  "src/lib/program/generate.ts" \
  "if (aCompound && !bCompound) return -1;" \
  "\/\/ MUTANT: removed compound sort"

# Mutation 4: Change timed hold check to allow them in main slots
test_mutation \
  "Allow timed holds in main slots" \
  "src/lib/program/generate.ts" \
  "if (candidate.metric === \"seconds\")" \
  "if (false \/\* MUTANT: disabled *\/)"

# Mutation 5: Remove accessory set cap
test_mutation \
  "Remove accessory set cap" \
  "src/lib/program/generate.ts" \
  "acc.targetSets = minMainSets;" \
  "\/\/ MUTANT: removed cap"

# Mutation 6: Remove RDL from floor-pull deadlifts
test_mutation \
  "Allow romanian-deadlift for knee injury" \
  "src/lib/program/generate.ts" \
  "'romanian-deadlift'," \
  "\/\/ MUTANT: removed RDL,"

# Mutation 7: Remove knee-safe quad filter
test_mutation \
  "Remove knee-safe quad restriction" \
  "src/lib/program/generate.ts" \
  "KNEE_SAFE_QUAD_EXERCISES.has(e.slug)" \
  "true \/\/ MUTANT"

echo ""
echo "=============================="
echo "Mutation Testing Results"
echo "=============================="
echo "Total mutations: $TOTAL"
echo -e "Killed: $((TOTAL - FAILED)) ${GREEN}✓${NC}"
echo -e "Survived: $FAILED ${RED}✗${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}FAILED: $FAILED mutation(s) survived!${NC}"
  exit 1
else
  echo -e "${GREEN}SUCCESS: All mutations killed!${NC}"
  exit 0
fi
