#!/usr/bin/env bash
# Test mutants for past-knee squat swap slice ordering
# All mutants must be KILLED by test:past-knee-squat-swap-lengths

set -euo pipefail

BACKUP_FILE=$(mktemp)
trap 'cp "$BACKUP_FILE" src/lib/program/alternatives.ts 2>/dev/null || true; rm -f "$BACKUP_FILE"' EXIT

# Backup original file
cp src/lib/program/alternatives.ts "$BACKUP_FILE"

echo "=== Testing Past-Knee Squat Swap Slice Mutants ==="
echo

mutants_tested=0
mutants_killed=0
mutants_survived=0
mutants_crashed=0

run_mutant() {
  local name="$1"
  local pattern="$2"
  local replacement="$3"
  
  echo "Testing mutant: $name"
  
  # Restore backup
  cp "$BACKUP_FILE" src/lib/program/alternatives.ts
  
  # Check pattern exists exactly once
  local match_count
  match_count=$(grep -Fc "$pattern" src/lib/program/alternatives.ts || echo "0")
  if [ "$match_count" != "1" ]; then
    echo "  ✗ SKIP: Pattern not found exactly once (found $match_count times)"
    echo "  Pattern: $pattern"
    mutants_crashed=$((mutants_crashed + 1))
    return 1
  fi
  
  # Apply mutant
  sed -i "s/$pattern/$replacement/" src/lib/program/alternatives.ts
  
  # Verify pattern was replaced
  if grep -Fq "$pattern" src/lib/program/alternatives.ts; then
    echo "  ✗ SKIP: Pattern still present after sed"
    mutants_crashed=$((mutants_crashed + 1))
    return 1
  fi
  
  # Run tsc
  echo "  Running tsc..."
  if ! npx tsc --noEmit 2>&1 | tee /tmp/mutant-tsc.log; then
    echo "  ✗ CRASH: tsc failed"
    cat /tmp/mutant-tsc.log
    mutants_crashed=$((mutants_crashed + 1))
    return 1
  fi
  
  # Run test
  echo "  Running test:past-knee-squat-swap-lengths..."
  local test_output
  local test_exit
  test_output=$(npm run test:past-knee-squat-swap-lengths 2>&1) || test_exit=$?
  
  # Check for crashes (syntax errors, transform failures, etc.)
  if echo "$test_output" | grep -qE "(TypeError|ReferenceError|SyntaxError|Transform failed)"; then
    echo "  ✗ CRASH: Test crashed"
    echo "$test_output" | head -20
    mutants_crashed=$((mutants_crashed + 1))
    return 1
  fi
  
  if [ "${test_exit:-0}" -eq 0 ]; then
    echo "  ✗ SURVIVED"
    mutants_survived=$((mutants_survived + 1))
    return 1
  else
    echo "  ✓ KILLED"
    mutants_killed=$((mutants_killed + 1))
    return 0
  fi
}

# Mutant 1: slice-first (the original bug)
run_mutant \
  "slice-first" \
  "const effectiveLimit = isPastKneeSquatSwap ? Number.POSITIVE_INFINITY : limit;" \
  "const effectiveLimit = limit;"
mutants_tested=$((mutants_tested + 1))

# Mutant 2: cap-at-8-before-filter
run_mutant \
  "cap-at-8-before-filter" \
  "const effectiveLimit = isPastKneeSquatSwap ? Number.POSITIVE_INFINITY : limit;" \
  "const effectiveLimit = isPastKneeSquatSwap ? 8 : limit;"
mutants_tested=$((mutants_tested + 1))

# Mutant 3: no-final-slice (remove the .slice(0, limit) at the end)
# This is trickier - we need to find the return statement for past-knee squat swaps
# Let's target the specific line that does the final slice
run_mutant \
  "no-final-slice" \
  "return reordered.slice(0, limit);" \
  "return reordered;"
mutants_tested=$((mutants_tested + 1))

# Restore backup
cp "$BACKUP_FILE" src/lib/program/alternatives.ts

echo
echo "=== Mutant Testing Summary ==="
echo "Tested: $mutants_tested"
echo "Killed: $mutants_killed"
echo "Survived: $mutants_survived"
echo "Crashed: $mutants_crashed"

if [ "$mutants_survived" -gt 0 ] || [ "$mutants_crashed" -gt 0 ]; then
  echo
  echo "✗ FAILED: Some mutants survived or crashed"
  exit 1
fi

echo
echo "✓ PASSED: All mutants killed"
exit 0
