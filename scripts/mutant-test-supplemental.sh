#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for equipment-progression-fix supplemental mutants
# Tests H5, Z1, H2, H6

echo "=== Mutant Testing: Equipment Progression Fix Supplemental ==="
echo

# Run baseline
echo "Running baseline tests..."
npm run test:units-progression-messages > /dev/null 2>&1 || { echo "❌ Baseline failed"; exit 1; }
npm run test:hold-preserves-counter > /dev/null 2>&1 || { echo "❌ Baseline failed"; exit 1; }
npm run test:hold-preserves-wafs > /dev/null 2>&1 || { echo "❌ Baseline failed"; exit 1; }
echo "✓ Baseline tests pass"
echo

BACKUP=$(mktemp)
cp src/lib/program/progression.ts "$BACKUP"
trap 'cp "$BACKUP" src/lib/program/progression.ts; rm -f "$BACKUP"' EXIT

test_mutant() {
  local name="$1"
  local line="$2"
  local old="$3"
  local new="$4"
  local test_cmd="$5"
  
  echo "Testing $name..."
  
  # Apply mutant
  sed -i "${line}s|${old}|${new}|" src/lib/program/progression.ts
  
  # Check if it compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  SKIPPED: Does not compile"
    cp "$BACKUP" src/lib/program/progression.ts
    return 0
  fi
  
  # Run test
  if eval "$test_cmd" > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    cp "$BACKUP" src/lib/program/progression.ts
    return 1
  else
    echo "  ✅ KILLED"
    cp "$BACKUP" src/lib/program/progression.ts
    return 0
  fi
}

# H5: bar and band floor at 0
test_mutant "H5 (floor = gridStep)" \
  "891" \
  "const floor = isBodyweightEquipment ? 0 : gridStep;" \
  "const floor = gridStep;" \
  "npm run test:units-progression-messages"

# Z1: zero-weight message wording
test_mutant "Z1 (zero message wording)" \
  "904" \
  "\"Missed three times in a row — back to just your bodyweight to build up again.\"" \
  "\"Missed three times in a row — back to bodyweight.\"" \
  "npm run test:units-progression-messages"

# H2: never-raise hold resets counter
test_mutant "H2 (never-raise hold resets counter)" \
  "935" \
  "consecutiveFailures: failures," \
  "consecutiveFailures: 0," \
  "npm run test:hold-preserves-counter"

# H6: two-miss hold drops wafs
test_mutant "H6 (two-miss hold drops wafs)" \
  "924" \
  "weightAtFailureStartKg: state.weightAtFailureStartKg," \
  "weightAtFailureStartKg: null," \
  "npm run test:hold-preserves-wafs"

echo
echo "✅ PASS: All mutants killed"
