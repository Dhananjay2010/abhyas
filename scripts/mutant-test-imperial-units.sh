#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for imperial units wiring
# Tests UN1, UN2, UN4

echo "=== Mutant Testing: Imperial Units Wiring ==="
echo

# Run baseline
echo "Running baseline tests..."
npm run test:imperial-actions-path > /dev/null 2>&1 || { echo "❌ Baseline failed"; exit 1; }
echo "✓ Baseline tests pass"
echo

BACKUP_TEST=$(mktemp)
BACKUP_BUILDER=$(mktemp)
cp scripts/test-imperial-actions-path.ts "$BACKUP_TEST"
cp src/lib/session/build-progression-input.ts "$BACKUP_BUILDER"
trap 'cp "$BACKUP_TEST" scripts/test-imperial-actions-path.ts; cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts; rm -f "$BACKUP_TEST" "$BACKUP_BUILDER"' EXIT

killed=0
survived=0
skipped=0
crashed=0

test_test_mutant() {
  local name="$1"
  local search="$2"
  local replace="$3"
  
  echo "Testing $name..."
  
  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('scripts/test-imperial-actions-path.ts', 'utf8');
    const search = process.argv[1];
    const replace = process.argv[2];
    const newContent = content.replace(search, replace);
    if (newContent === content) {
      console.error('ERROR: Pattern not found');
      process.exit(1);
    }
    fs.writeFileSync('scripts/test-imperial-actions-path.ts', newContent);
  " "$search" "$replace"
  
  if [ $? -ne 0 ]; then
    echo "  ⚠️  SKIPPED: Pattern not found"
    cp "$BACKUP_TEST" scripts/test-imperial-actions-path.ts
    ((skipped++))
    return 1
  fi
  
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  SKIPPED: Does not compile"
    cp "$BACKUP_TEST" scripts/test-imperial-actions-path.ts
    ((skipped++))
    return 1
  fi
  
  local output
  output=$(npm run test:imperial-actions-path 2>&1)
  local rc=$?
  
  if echo "$output" | grep -qE 'TypeError|ReferenceError|SyntaxError|Transform failed'; then
    echo "  💥 CRASHED"
    cp "$BACKUP_TEST" scripts/test-imperial-actions-path.ts
    ((crashed++))
    return 1
  fi
  
  if [ $rc -eq 0 ]; then
    echo "  ❌ SURVIVED"
    cp "$BACKUP_TEST" scripts/test-imperial-actions-path.ts
    ((survived++))
    return 1
  else
    echo "  ✅ KILLED"
    cp "$BACKUP_TEST" scripts/test-imperial-actions-path.ts
    ((killed++))
    return 0
  fi
}

test_builder_mutant() {
  local name="$1"
  local search="$2"
  local replace="$3"
  
  echo "Testing $name..."
  
  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('src/lib/session/build-progression-input.ts', 'utf8');
    const search = process.argv[1];
    const replace = process.argv[2];
    const newContent = content.replace(search, replace);
    if (newContent === content) {
      console.error('ERROR: Pattern not found');
      process.exit(1);
    }
    fs.writeFileSync('src/lib/session/build-progression-input.ts', newContent);
  " "$search" "$replace"
  
  if [ $? -ne 0 ]; then
    echo "  ⚠️  SKIPPED: Pattern not found"
    cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts
    ((skipped++))
    return 1
  fi
  
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  SKIPPED: Does not compile"
    cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts
    ((skipped++))
    return 1
  fi
  
  local output
  output=$(npm run test:imperial-actions-path 2>&1)
  local rc=$?
  
  if echo "$output" | grep -qE 'TypeError|ReferenceError|SyntaxError|Transform failed'; then
    echo "  💥 CRASHED"
    cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts
    ((crashed++))
    return 1
  fi
  
  if [ $rc -eq 0 ]; then
    echo "  ❌ SURVIVED"
    cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts
    ((survived++))
    return 1
  else
    echo "  ✅ KILLED"
    cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts
    ((killed++))
    return 0
  fi
}

# UN1: Pass "metric" instead of units
test_test_mutant "UN1 (pass metric)" \
  "const input = buildProgressionInput(sessionExercise, sets, progress, session, feel, units);" \
  "const input = buildProgressionInput(sessionExercise, sets, progress, session, feel, \"metric\");" || true

# UN2: Remove units from describePersonalBest
test_test_mutant "UN2 (describePersonalBest without units)" \
  "? describePersonalBest(decision.personalBest, units)" \
  "? describePersonalBest(decision.personalBest)" || true

# UN4: Return wrong units value
test_builder_mutant "UN4 (builder returns undefined for units)" \
  "    units," \
  "    units: undefined," || true

echo
echo "Killed: $killed  Survived: $survived  Skipped: $skipped  Crashed: $crashed"

if [ $survived -gt 0 ] || [ $skipped -gt 0 ] || [ $crashed -gt 0 ]; then
  echo "❌ FAIL: $survived survivor(s), $skipped skip(s), $crashed crash(es)"
  exit 1
fi

echo "✅ PASS: All mutants killed"
