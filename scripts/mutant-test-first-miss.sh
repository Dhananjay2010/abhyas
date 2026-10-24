#!/bin/bash
set -u

# Mutant test for first-miss hold guard.
# Each mutant should be killed by the tests.

FILE="src/lib/program/progression.ts"
BACKUP="${FILE}.backup"
TESTS="npm run test:first-miss-hold-guard && npx tsx scripts/test-first-miss-noequip-sweep.ts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

cleanup() {
  if [ -f "$BACKUP" ]; then
    mv "$BACKUP" "$FILE"
  fi
}

trap cleanup EXIT INT TERM

echo "Running baseline..."
if ! eval "$TESTS" > /dev/null 2>&1; then
  echo -e "${RED}FAIL: Baseline tests failed${NC}"
  exit 1
fi
echo -e "${GREEN}Baseline PASS${NC}"

# Mutant tracking
total=0
killed=0
survived=0
skipped=0

run_mutant() {
  local name="$1"
  local search="$2"
  local replace="$3"
  
  total=$((total + 1))
  
  echo ""
  echo "Mutant $total: $name"
  
  # Backup original
  cp "$FILE" "$BACKUP"
  
  # Apply mutant
  if ! sed -i "s|$search|$replace|g" "$FILE"; then
    echo -e "  ${YELLOW}SKIP: sed failed${NC}"
    skipped=$((skipped + 1))
    mv "$BACKUP" "$FILE"
    return
  fi
  
  # Check if file changed
  if cmp -s "$FILE" "$BACKUP"; then
    echo -e "  ${YELLOW}SKIP: file unchanged${NC}"
    skipped=$((skipped + 1))
    mv "$BACKUP" "$FILE"
    return
  fi
  
  # Check if mutant compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo -e "  ${YELLOW}SKIP: does not compile${NC}"
    skipped=$((skipped + 1))
    mv "$BACKUP" "$FILE"
    return
  fi
  
  # Run tests
  if eval "$TESTS" > /dev/null 2>&1; then
    echo -e "  ${RED}SURVIVED${NC}"
    survived=$((survived + 1))
  else
    echo -e "  ${GREEN}KILLED${NC}"
    killed=$((killed + 1))
  fi
  
  # Restore original
  mv "$BACKUP" "$FILE"
}

# Mutant (a): guard removed (always drop)
run_mutant \
  "(a) guard removed" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {" \
  "if (false) {"

# Mutant (b): threshold 0.20 to 0.5
run_mutant \
  "(b) threshold 0.20 to 0.5" \
  "FIRST_MISS_HOLD_THRESHOLD = 0.20" \
  "FIRST_MISS_HOLD_THRESHOLD = 0.5"

# Mutant (c): > changed to >= (boundary off by one)
run_mutant \
  "(c) > changed to >=" \
  "cutFraction > FIRST_MISS_HOLD_THRESHOLD" \
  "cutFraction >= FIRST_MISS_HOLD_THRESHOLD"

# Mutant (d): guard inverted (always hold)
run_mutant \
  "(d) guard inverted" \
  "if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {" \
  "if (cutFraction <= FIRST_MISS_HOLD_THRESHOLD) {"

# Mutant (e): consecutiveFailures not incremented
run_mutant \
  "(e) failures not incremented" \
  "consecutiveFailures: failures," \
  "consecutiveFailures: state.consecutiveFailures,"

# Summary
echo ""
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
printf "%-30s %3d\n" "Total mutants:" "$total"
printf "%-30s %3d\n" "Killed:" "$killed"
printf "%-30s %3d\n" "Survived:" "$survived"
printf "%-30s %3d\n" "Skipped:" "$skipped"
echo "========================================="

if [ "$survived" -gt 0 ] || [ "$skipped" -gt 0 ]; then
  echo -e "${RED}FAIL: $survived survived, $skipped skipped${NC}"
  exit 1
else
  echo -e "${GREEN}PASS: All mutants killed${NC}"
  exit 0
fi
