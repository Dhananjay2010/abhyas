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
  output=$(eval "$test_cmd" 2>&1)
  local rc=$?
  
  # Check for crashes
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

# H5: bar and band floor at 0
test_mutant "H5 (floor = gridStep)" \
  "        const floor = isBodyweightEquipment ? 0 : gridStep;" \
  "        const floor = gridStep;" \
  "npm run test:units-progression-messages" || true

# Z1: zero-weight message wording
test_mutant "Z1 (zero message wording)" \
  "dropping to bodyweight to build up again" \
  "back to just your bodyweight to build up again" \
  "npm run test:units-progression-messages" || true

# H2: never-raise hold resets counter
test_mutant "H2 (never-raise hold resets counter)" \
  "      return {
        ...carried,
        outcome: \"hold\",
        nextWorkingWeightKg: currentWeight,
        nextTargetReps: repsMax,
        consecutiveFailures: failures, // Keep counter so third miss triggers step-down
        weightAtFailureStartKg: state.weightAtFailureStartKg, // M1: preserve for third miss
        message: failures >= 3
          ? \"Missed the target again but no lighter loadable weight fits within 10% — holding to build back up.\"
          : \"Missed twice in a row but no lighter loadable weight fits within 10% — holding to build back up.\",
      };" \
  "      return {
        ...carried,
        outcome: \"hold\",
        nextWorkingWeightKg: currentWeight,
        nextTargetReps: repsMax,
        consecutiveFailures: 0, // Keep counter so third miss triggers step-down
        weightAtFailureStartKg: state.weightAtFailureStartKg, // M1: preserve for third miss
        message: failures >= 3
          ? \"Missed the target again but no lighter loadable weight fits within 10% — holding to build back up.\"
          : \"Missed twice in a row but no lighter loadable weight fits within 10% — holding to build back up.\",
      };" \
  "npm run test:hold-preserves-counter" || true

# H6: two-miss hold drops wafs (reduced === current hold)
test_mutant "H6 (two-miss hold drops wafs)" \
  "        consecutiveFailures: failures, // Keep counter so third miss triggers step-down
        weightAtFailureStartKg: state.weightAtFailureStartKg, // M1: preserve for third miss
        message: holdMessage," \
  "        consecutiveFailures: failures, // Keep counter so third miss triggers step-down
        weightAtFailureStartKg: null, // M1: preserve for third miss
        message: holdMessage," \
  "npm run test:hold-preserves-wafs" || true

echo
echo "Killed: $killed  Survived: $survived  Skipped: $skipped  Crashed: $crashed"

if [ $survived -gt 0 ] || [ $skipped -gt 0 ] || [ $crashed -gt 0 ]; then
  echo "❌ FAIL: $survived survivor(s), $skipped skip(s), $crashed crash(es)"
  exit 1
fi

echo "✅ PASS: All mutants killed"
