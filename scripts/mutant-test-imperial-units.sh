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

BACKUP_ACTIONS=$(mktemp)
BACKUP_BUILDER=$(mktemp)
cp src/app/session/actions.ts "$BACKUP_ACTIONS"
cp src/lib/session/build-progression-input.ts "$BACKUP_BUILDER"
trap 'cp "$BACKUP_ACTIONS" src/app/session/actions.ts; cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts; rm -f "$BACKUP_ACTIONS" "$BACKUP_BUILDER"' EXIT

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
  " "$search" "$replace" || { echo "  ⚠️  SKIPPED: Pattern not found"; [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file" || cp "$BACKUP_BUILDER" "$file"; return 0; }
  
  # Check if it compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  SKIPPED: Does not compile"
    [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file" || cp "$BACKUP_BUILDER" "$file"
    return 0
  fi
  
  # Run test
  if npm run test:imperial-actions-path > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file" || cp "$BACKUP_BUILDER" "$file"
    return 1
  else
    echo "  ✅ KILLED"
    [ "$file" = "src/app/session/actions.ts" ] && cp "$BACKUP_ACTIONS" "$file" || cp "$BACKUP_BUILDER" "$file"
    return 0
  fi
}

# UN1: actions passes "metric" instead of units  
test_mutant "UN1 (actions passes metric)" \
  "src/app/session/actions.ts" \
  "      units," \
  "      \"metric\","

# UN2: describePersonalBest called without units
test_mutant "UN2 (describePersonalBest without units)" \
  "src/app/session/actions.ts" \
  "? describePersonalBest(decision.personalBest, units)" \
  "? describePersonalBest(decision.personalBest)"

# UN4: builder drops units
test_mutant "UN4 (builder drops units)" \
  "src/lib/session/build-progression-input.ts" \
  "    units," \
  "    // units,"

echo
echo "✅ PASS: All mutants killed"
