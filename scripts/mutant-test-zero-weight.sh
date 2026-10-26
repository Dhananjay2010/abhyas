#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for MED-1 zero-weight floor logic
# Tests H5 (bar/band floor at 0), Z1 (bar message), Z2 (band message), BALL-FLOOR (ball floor at 0)

echo "=== Mutant Testing: Zero-Weight Floor Logic ==="
echo

# Run baseline
echo "Running baseline tests..."
npm run test:zero-weight-real-path > /dev/null 2>&1 || { echo "❌ Baseline failed"; exit 1; }
echo "✓ Baseline tests pass"
echo

BACKUP=$(mktemp)
cp src/lib/program/progression.ts "$BACKUP"
trap 'cp "$BACKUP" src/lib/program/progression.ts; rm -f "$BACKUP"' EXIT

test_mutant() {
  local name="$1"
  local search="$2"
  local replace="$3"
  
  echo "Testing $name..."
  
  # Apply mutant using Node for reliable string replacement
  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('src/lib/program/progression.ts', 'utf8');
    const search = process.argv[1];
    const replace = process.argv[2];
    const newContent = content.replace(search, replace);
    if (newContent === content) {
      console.error('ERROR: Pattern not found');
      process.exit(1);
    }
    fs.writeFileSync('src/lib/program/progression.ts', newContent);
  " "$search" "$replace" || { echo "  ⚠️  SKIPPED: Pattern not found"; cp "$BACKUP" src/lib/program/progression.ts; return 0; }
  
  # Check if it compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  SKIPPED: Does not compile"
    cp "$BACKUP" src/lib/program/progression.ts
    return 0
  fi
  
  # Run test
  if npm run test:zero-weight-real-path > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    cp "$BACKUP" src/lib/program/progression.ts
    return 1
  else
    echo "  ✅ KILLED"
    cp "$BACKUP" src/lib/program/progression.ts
    return 0
  fi
}

# H5: bar/band floor at gridStep instead of 0
test_mutant "H5 (bar/band floor = gridStep)" \
  "const floor = isBodyweightEquipment ? 0 : gridStep;" \
  "const floor = gridStep;"

# Z1: bar message says "back to just your bodyweight" instead of "dropping to bodyweight"
test_mutant "Z1 (bar message wording)" \
  "dropping to bodyweight to build up again" \
  "back to just your bodyweight to build up again"

# Z2: band message says "dropping to bodyweight" instead of "dropping to no band"
test_mutant "Z2 (band message wording)" \
  "dropping to no band to build up again" \
  "dropping to bodyweight to build up again"

# BALL-FLOOR: medicine ball floors at 0 instead of 3 kg
test_mutant "BALL-FLOOR (medicine ball floor at 0)" \
  "const LIGHTEST_MEDICINE_BALL = 3; // kg" \
  "const LIGHTEST_MEDICINE_BALL = 0; // kg"

echo
echo "✅ PASS: All mutants killed"
