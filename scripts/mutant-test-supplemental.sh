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

killed=0
survived=0
skipped=0
crashed=0

test_mutant() {
  local name="$1"
  local search="$2"
  local replace="$3"
  local test_cmd="$4"
  
  echo "Testing $name..."
  
  # Apply mutant using Node for reliable string replacement
  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('src/lib/program/progression.ts', 'utf8');
    const search = process.argv[1];
    const replace = process.argv[2];
    const newContent = content.split(search).join(replace);
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
  output=$(eval "$test_cmd" 2>&1)
  local rc=$?
  
  
  # Check for crashes: stack traces, node:internal, empty output
  # KILLED: non-zero exit + assertion marker (FAIL/❌/AssertionError) + no crash indicators
  if [ $rc -ne 0 ]; then
    if echo "$output" | grep -qE "^\s+at |node:internal|triggerUncaughtException"; then
      echo "  💥 CRASHED"
      cp "$BACKUP" "$PROG"
      ((crashed++))
      return 1
    elif [ -z "$output" ]; then
      echo "  💥 CRASHED (empty output)"
      cp "$BACKUP" "$PROG"
      ((crashed++))
      return 1
    elif echo "$output" | grep -qE "FAIL|❌|AssertionError"; then
      echo "  ✅ KILLED"
      cp "$BACKUP" "$PROG"
      ((killed++))
      return 0
    else
      echo "  ❌ SURVIVED (no assertion marker)"
      cp "$BACKUP" "$PROG"
      ((survived++))
      return 1
    fi
  fi
  
  # Exit 0: mutant survived
  echo "  ❌ SURVIVED"
  cp "$BACKUP" "$PROG"
  ((survived++))
  return 1
}

# H5: bar and band floor at 0
test_mutant "H5 (floor = gridStep)" \
  "const floor = isBodyweightEquipment ? 0 : gridStep;" \
  "const floor = gridStep;" \
  "npm run test:zero-weight-real-path" || true

# Z1: zero-weight message wording
test_mutant "Z1 (zero message wording)" \
  "dropping to bodyweight to build up again" \
  "back to just your bodyweight to build up again" \
  "npm run test:zero-weight-real-path" || true

# H2: never-raise hold resets counter (2 occurrences, using replaceAll)
test_mutant "H2 (never-raise hold resets counter)" \
  "consecutiveFailures: failures, // Keep counter so third miss triggers step-down" \
  "consecutiveFailures: 0, // MUTANT: reset counter" \
  "npm run test:hold-preserves-counter" || true

# H6: two-miss hold drops wafs (reduced === current hold)
test_mutant "H6 (two-miss hold drops wafs)" \
  "weightAtFailureStartKg: state.weightAtFailureStartKg, // M1: preserve for third miss" \
  "weightAtFailureStartKg: null, // M1: preserve for third miss" \
  "npm run test:hold-preserves-wafs" || true

echo
echo "Killed: $killed  Survived: $survived  Skipped: $skipped  Crashed: $crashed"

if [ $survived -gt 0 ] || [ $skipped -gt 0 ] || [ $crashed -gt 0 ]; then
  echo "❌ FAIL: $survived survivor(s), $skipped skip(s), $crashed crash(es)"
  exit 1
fi

echo "✅ PASS: All mutants killed"
