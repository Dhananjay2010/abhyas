#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for MED-1 zero-weight floor logic
# Tests H5, Z1, Z2, BALL-FLOOR

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

killed=0
survived=0
skipped=0
crashed=0

test_mutant() {
  local name="$1"
  local search="$2"
  local replace="$3"
  
  echo "Testing $name..."
  
  # Apply mutant
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
  " "$search" "$replace"
  
  if [ $? -ne 0 ]; then
    echo "  ⚠️  SKIPPED: Pattern not found"
    cp "$BACKUP" src/lib/program/progression.ts
    ((skipped++))
    return 1
  fi
  
  # Check if it compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  SKIPPED: Does not compile"
    cp "$BACKUP" src/lib/program/progression.ts
    ((skipped++))
    return 1
  fi
  
  # Run test and capture output
  local output
  output=$(npm run test:zero-weight-real-path 2>&1)
  local rc=$?
  
  # Check for crash indicators
  if echo "$output" | grep -qE 'TypeError|ReferenceError|SyntaxError|Transform failed'; then
    echo "  💥 CRASHED"
    cp "$BACKUP" src/lib/program/progression.ts
    ((crashed++))
    return 1
  fi
  
  if [ $rc -eq 0 ]; then
    echo "  ❌ SURVIVED"
    cp "$BACKUP" src/lib/program/progression.ts
    ((survived++))
    return 1
  else
    echo "  ✅ KILLED"
    cp "$BACKUP" src/lib/program/progression.ts
    ((killed++))
    return 0
  fi
}

# H5: bar/band floor at gridStep instead of 0
test_mutant "H5 (bar/band floor = gridStep)" \
  "const floor = isBodyweightEquipment ? 0 : gridStep;" \
  "const floor = gridStep;" || true || true

# Z1: bar message
test_mutant "Z1 (bar message wording)" \
  "dropping to bodyweight to build up again" \
  "back to just your bodyweight to build up again" || true

# Z2: band message
test_mutant "Z2 (band message wording)" \
  "dropping to no band to build up again" \
  "dropping to bodyweight to build up again" || true

# BALL-FLOOR: medicine ball floors at lightest instead of correct check
test_mutant "BALL-FLOOR (medicine ball floor check)" \
  "if (currentWeight <= MEDICINE_BALL_MIN_KG)" \
  "if (currentWeight <= 0)" || true

echo
echo "Killed: $killed  Survived: $survived  Skipped: $skipped  Crashed: $crashed"

if [ $survived -gt 0 ] || [ $skipped -gt 0 ] || [ $crashed -gt 0 ]; then
  echo "❌ FAIL: $survived survivor(s), $skipped skip(s), $crashed crash(es)"
  exit 1
fi

echo "✅ PASS: All mutants killed"
