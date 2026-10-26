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
  local description="$2"
  shift 2
  
  echo "Testing mutant: $name"
  
  # Restore backup
  cp "$BACKUP_FILE" src/lib/program/alternatives.ts
  
  # Apply mutant using the command passed as remaining arguments
  if ! "$@"; then
    echo "  ✗ SKIP: Mutant application failed"
    mutants_crashed=$((mutants_crashed + 1))
    return 1
  fi
  
  # Run tsc
  echo "  Running tsc..."
  if ! npx tsc --noEmit >/dev/null 2>&1; then
    echo "  ✗ CRASH: tsc failed"
    mutants_crashed=$((mutants_crashed + 1))
    return 1
  fi
  
  # Run test
  echo "  Running test:past-knee-squat-swap-lengths..."
  local test_exit=0
  npm run test:past-knee-squat-swap-lengths >/dev/null 2>&1 || test_exit=$?
  
  if [ "$test_exit" -eq 0 ]; then
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
  "Set effectiveLimit to limit for all cases" \
  sed -i 's/const effectiveLimit = isPastKneeSquatSwap ? Number.POSITIVE_INFINITY : limit;/const effectiveLimit = limit;/' src/lib/program/alternatives.ts
mutants_tested=$((mutants_tested + 1))

# Mutant 2: cap-at-8-before-filter
run_mutant \
  "cap-at-8-before-filter" \
  "Cap effectiveLimit at 8 for past-knee squats" \
  sed -i 's/const effectiveLimit = isPastKneeSquatSwap ? Number.POSITIVE_INFINITY : limit;/const effectiveLimit = isPastKneeSquatSwap ? 8 : limit;/' src/lib/program/alternatives.ts
mutants_tested=$((mutants_tested + 1))

# Mutant 3: no-final-slice (remove .slice(0, limit) from the main return)
run_mutant \
  "no-final-slice" \
  "Remove final slice on line 483" \
  sed -i '483s/\.slice(0, limit)//' src/lib/program/alternatives.ts
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
