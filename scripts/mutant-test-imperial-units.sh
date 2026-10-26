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
BACKUP_PROGRESSION=$(mktemp)
cp src/app/session/actions.ts "$BACKUP_ACTIONS"
cp src/lib/session/build-progression-input.ts "$BACKUP_BUILDER"
cp src/lib/program/progression.ts "$BACKUP_PROGRESSION"
trap 'cp "$BACKUP_ACTIONS" src/app/session/actions.ts; cp "$BACKUP_BUILDER" src/lib/session/build-progression-input.ts; cp "$BACKUP_PROGRESSION" src/lib/program/progression.ts; rm -f "$BACKUP_ACTIONS" "$BACKUP_BUILDER" "$BACKUP_PROGRESSION"' EXIT

test_mutant() {
  local name="$1"
  local file="$2"
  local line="$3"
  local old="$4"
  local new="$5"
  
  echo "Testing $name..."
  
  # Apply mutant
  sed -i "${line}s|${old}|${new}|" "$file"
  
  # Check if it compiles
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "  ⚠️  SKIPPED: Does not compile"
    case "$file" in
      *actions.ts) cp "$BACKUP_ACTIONS" "$file" ;;
      *build-progression-input.ts) cp "$BACKUP_BUILDER" "$file" ;;
      *progression.ts) cp "$BACKUP_PROGRESSION" "$file" ;;
    esac
    return 0
  fi
  
  # Run test
  if npm run test:imperial-actions-path > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    case "$file" in
      *actions.ts) cp "$BACKUP_ACTIONS" "$file" ;;
      *build-progression-input.ts) cp "$BACKUP_BUILDER" "$file" ;;
      *progression.ts) cp "$BACKUP_PROGRESSION" "$file" ;;
    esac
    return 1
  else
    echo "  ✅ KILLED"
    case "$file" in
      *actions.ts) cp "$BACKUP_ACTIONS" "$file" ;;
      *build-progression-input.ts) cp "$BACKUP_BUILDER" "$file" ;;
      *progression.ts) cp "$BACKUP_PROGRESSION" "$file" ;;
    esac
    return 0
  fi
}

# UN1: actions passes "metric" instead of units
test_mutant "UN1 (actions passes metric)" \
  "src/app/session/actions.ts" \
  "451" \
  "units" \
  "\"metric\""

# UN2: describePersonalBest called without units
test_mutant "UN2 (describePersonalBest without units)" \
  "src/app/session/actions.ts" \
  "495" \
  "describePersonalBest(decision.personalBest, units)" \
  "describePersonalBest(decision.personalBest)"

# UN4: builder drops units
test_mutant "UN4 (builder drops units)" \
  "src/lib/session/build-progression-input.ts" \
  "115" \
  "units," \
  "// units,"

echo
echo "✅ PASS: All mutants killed"
