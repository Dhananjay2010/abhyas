#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for imperial units wiring
# Tests UN1, UN2, UN4 against PRODUCTION code

echo "=== Mutant Testing: Imperial Units Wiring (Production Code) ==="
echo

# Run baseline
echo "Running baseline tests..."
npm run test:imperial-actions-path > /dev/null 2>&1 || { echo "❌ Baseline failed"; exit 1; }
echo "✓ Baseline tests pass"
echo

BACKUP_ACTIONS=$(mktemp)
BACKUP_FEEDBACK=$(mktemp)
BACKUP_BUILDER=$(mktemp)
cp src/app/session/actions.ts "$BACKUP_ACTIONS"
cp src/lib/session/progression-feedback.ts "$BACKUP_FEEDBACK"
cp src/lib/session/build-progression-input.ts "$BACKUP_BUILDER"
trap 'cp "$BACKUP_ACTIONS" src/app/session/actions.ts; cp "$BACKUP_FEEDBACK" src/lib/session/progression-feedback.ts; cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts; rm -f "$BACKUP_ACTIONS" "$BACKUP_FEEDBACK" "$BACKUP_BUILDER"' EXIT

killed=0
survived=0
skipped=0
crashed=0

test_mutant() {
  local name="$1"
  local file="$2"
  local search="$3"
  local replace="$4"
  
  echo "Testing $name..."
  
  # Apply mutant
  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('$file', 'utf8');
    const search = process.argv[1];
    const replace = process.argv[2];
    const newContent = content.replace(search, replace);
    if (newContent === content) {
      console.error('ERROR: Pattern not found');
      process.exit(1);
    }
    fs.writeFileSync('$file', newContent);
  " "$search" "$replace"
  
  if [ $? -ne 0 ]; then
    echo "  ⚠️  SKIPPED: Pattern not found"
    [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file"
    [ "$file" = "src/lib/session/progression-feedback.ts" ] && cp "$BACKUP_FEEDBACK" "$file"
    [ "$file" = "src/lib/session/build-progression-input.ts" ] && cp "$BACKUP_BUILDER" "$file"
    ((skipped++))
    return 1
  fi
  
  # Check if it compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  SKIPPED: Does not compile"
    [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file"
    [ "$file" = "src/lib/session/progression-feedback.ts" ] && cp "$BACKUP_FEEDBACK" "$file"
    [ "$file" = "src/lib/session/build-progression-input.ts" ] && cp "$BACKUP_BUILDER" "$file"
    ((skipped++))
    return 1
  fi
  
  # Run test and capture output
  local output
  output=$(npm run test:imperial-actions-path 2>&1)
  local rc=$?
  
  # Check for crash indicators
  if echo "$output" | grep -qE 'TypeError|ReferenceError|SyntaxError|Transform failed'; then
    echo "  💥 CRASHED"
    [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file"
    [ "$file" = "src/lib/session/progression-feedback.ts" ] && cp "$BACKUP_FEEDBACK" "$file"
    [ "$file" = "src/lib/session/build-progression-input.ts" ] && cp "$BACKUP_BUILDER" "$file"
    ((crashed++))
    return 1
  fi
  
  if [ $rc -eq 0 ]; then
    echo "  ❌ SURVIVED"
    [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file"
    [ "$file" = "src/lib/session/progression-feedback.ts" ] && cp "$BACKUP_FEEDBACK" "$file"
    [ "$file" = "src/lib/session/build-progression-input.ts" ] && cp "$BACKUP_BUILDER" "$file"
    ((survived++))
    return 1
  else
    echo "  ✅ KILLED"
    echo "$output" | grep "❌ FAIL" | head -2
    [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file"
    [ "$file" = "src/lib/session/progression-feedback.ts" ] && cp "$BACKUP_FEEDBACK" "$file"
    [ "$file" = "src/lib/session/build-progression-input.ts" ] && cp "$BACKUP_BUILDER" "$file"
    ((killed++))
    return 0
  fi
}

# UN1: actions.ts passes "metric" instead of units
test_mutant "UN1 (actions.ts passes metric)" \
  "src/app/session/actions.ts" \
  "    units," \
  "    \"metric\"," || true

# UN2: progressionFeedback calls describePersonalBest without units
test_mutant "UN2 (describePersonalBest without units)" \
  "src/lib/session/progression-feedback.ts" \
  "describePersonalBest(decision.personalBest, units)" \
  "describePersonalBest(decision.personalBest)" || true

# UN4: buildProgressionInput drops units field
test_mutant "UN4 (builder drops units)" \
  "src/lib/session/build-progression-input.ts" \
  "    units," \
  "    // units," || true

echo
echo "Killed: $killed  Survived: $survived  Skipped: $skipped  Crashed: $crashed"

if [ $survived -gt 0 ] || [ $skipped -gt 0 ] || [ $crashed -gt 0 ]; then
  echo "❌ FAIL: $survived survivor(s), $skipped skip(s), $crashed crash(es)"
  exit 1
fi

echo "✅ PASS: All mutants killed"
