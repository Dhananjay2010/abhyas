#!/usr/bin/env bash
set -euo pipefail

# Simplified mutant test for Decision F
FILE="src/lib/program/progression.ts"
BASELINE_CMD="npm run test:first-miss-pinned"
COMPILE_CMD="npx tsc --noEmit"
MUTANT_TEST_CMD="npm run test:first-miss-pinned"

BACKUP=$(mktemp)
cp "$FILE" "$BACKUP"

cleanup() {
  cp "$BACKUP" "$FILE"
  rm -f "$BACKUP"
}
trap cleanup EXIT

echo "=== Mutant Testing: Decision F Core ===
"

# Baseline
if ! eval "$BASELINE_CMD" > /dev/null 2>&1; then
  echo "❌ Baseline failed"
  exit 1
fi
echo "✓ Baseline pass"

KILLED=0
SURVIVORS=()

test_mutant() {
  local name="$1"
  local old="$2"
  local new="$3"
  
  echo "Testing: $name"
  
  # Apply mutation
  sed -i "s|$old|$new|g" "$FILE"
  
  # Compile check
  if ! eval "$COMPILE_CMD" > /dev/null 2>&1; then
    cp "$BACKUP" "$FILE"
    echo "  ✓ KILLED (doesn't compile)"
    KILLED=$((KILLED + 1))
    return
  fi
  
  # Test
  if eval "$MUTANT_TEST_CMD" > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
  else
    echo "  ✅ KILLED"
    KILLED=$((KILLED + 1))
  fi
  
  # Restore
  cp "$BACKUP" "$FILE"
}

# Test core Decision F mutations
test_mutant "first-miss-drops" "const nextWeight = currentWeight;" "const nextWeight = currentWeight * 0.9;"
test_mutant "counter-not-set" "consecutiveFailures === 0 && currentWeight !== null" "false && currentWeight !== null"
test_mutant "failures-not-incremented" "consecutiveFailures: failures," "consecutiveFailures: 0,"

echo "
========================================
Killed: $KILLED
Survived: ${#SURVIVORS[@]}
========================================"

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "Survivors: ${SURVIVORS[@]}"
  exit 1
fi

echo "✅ All mutants killed"
