#!/usr/bin/env bash
# Test mutants for past-knee squat swap slice ordering
# All mutants must be KILLED by test:past-knee-squat-swap-lengths

set -euo pipefail

BACKUP_DIR=$(mktemp -d)
trap 'cp "$BACKUP_DIR/alternatives.ts" src/lib/program/alternatives.ts 2>/dev/null || true; rm -rf "$BACKUP_DIR"' EXIT

# Backup original file
cp src/lib/program/alternatives.ts "$BACKUP_DIR/alternatives.ts"

echo "=== Testing Past-Knee Squat Swap Slice Mutants ==="
echo

mutants_tested=0
mutants_killed=0
mutants_survived=0
mutants_crashed=0
mutants_skipped=0

run_mutant() {
  local name="$1"
  local description="$2"
  shift 2
  
  echo "Testing mutant: $name"
  echo "  Description: $description"
  
  # Restore backup
  cp "$BACKUP_DIR/alternatives.ts" src/lib/program/alternatives.ts
  
  # Apply mutant using the command passed as remaining arguments
  if ! "$@"; then
    echo "  ✗ SKIP: Mutant application command failed"
    mutants_skipped=$((mutants_skipped + 1))
    mutants_tested=$((mutants_tested + 1))
    return 0
  fi
  
  # Verify git diff is non-empty
  if ! git diff --exit-code src/lib/program/alternatives.ts >/dev/null 2>&1; then
    : # Non-empty diff, good
  else
    echo "  ✗ SKIP: No diff detected after mutation"
    mutants_skipped=$((mutants_skipped + 1))
    mutants_tested=$((mutants_tested + 1))
    return 0
  fi
  
  # Run tsc
  echo "  Running tsc..."
  if ! npx tsc --noEmit >/dev/null 2>&1; then
    echo "  ✗ CRASH: tsc failed"
    mutants_crashed=$((mutants_crashed + 1))
    mutants_tested=$((mutants_tested + 1))
    return 0
  fi
  
  # Run test
  echo "  Running test:past-knee-squat-swap-lengths..."
  local test_exit=0
  local test_output_file
  test_output_file=$(mktemp)
  npm run test:past-knee-squat-swap-lengths > "$test_output_file" 2>&1 || test_exit=$?
  
  if [ "$test_exit" -eq 0 ]; then
    echo "  ✗ SURVIVED"
    mutants_survived=$((mutants_survived + 1))
    mutants_tested=$((mutants_tested + 1))
    rm -f "$test_output_file"
    return 0
  fi
  
  # Test failed; check if it's a proper kill or a crash
  if grep -q -e '✗ FAIL' -e 'FAILED:' "$test_output_file"; then
    # Contains failure marker
    if grep -q -e 'TypeError' -e 'ReferenceError' -e 'SyntaxError' -e 'Transform failed' "$test_output_file"; then
      # Also contains crash signature
      echo "  ✗ CRASH: Test output contains error signature"
      mutants_crashed=$((mutants_crashed + 1))
    else
      # Clean kill
      echo "  ✓ KILLED"
      mutants_killed=$((mutants_killed + 1))
    fi
  else
    # Exit non-zero but no failure marker
    echo "  ✗ CRASH: Test exited non-zero without failure marker"
    mutants_crashed=$((mutants_crashed + 1))
  fi
  
  rm -f "$test_output_file"
  mutants_tested=$((mutants_tested + 1))
  return 0
}

# Mutant 1: slice-first (the original bug)
run_mutant \
  "slice-first" \
  "Set effectiveLimit to limit for all cases" \
  sed -i 's/const effectiveLimit = isPastKneeSquatSwap ? Number.POSITIVE_INFINITY : limit;/const effectiveLimit = limit;/' src/lib/program/alternatives.ts

# Mutant 2: cap-at-8-before-filter
run_mutant \
  "cap-at-8-before-filter" \
  "Cap effectiveLimit at 8 for past-knee squats" \
  sed -i 's/const effectiveLimit = isPastKneeSquatSwap ? Number.POSITIVE_INFINITY : limit;/const effectiveLimit = isPastKneeSquatSwap ? 8 : limit;/' src/lib/program/alternatives.ts

# Mutant 3: no-slice-line-472
run_mutant \
  "no-slice-line-472" \
  "Remove .slice(0, limit) from line 472" \
  sed -i 's/return \[\.\.\.restQuads, wallSit, \.\.\.hingeFallbacks\]\.slice(0, limit);/return [...restQuads, wallSit, ...hingeFallbacks];/' src/lib/program/alternatives.ts

# Mutant 4: no-slice-line-476
run_mutant \
  "no-slice-line-476" \
  "Remove .slice(0, limit) from line 476" \
  sed -i 's/return \[hingeFallbacks\[0\], wallSit, \.\.\.hingeFallbacks\.slice(1)\]\.slice(0, limit);/return [hingeFallbacks[0], wallSit, ...hingeFallbacks.slice(1)];/' src/lib/program/alternatives.ts

# Mutant 5: no-slice-line-483
run_mutant \
  "no-slice-line-483" \
  "Remove .slice(0, limit) from line 483" \
  sed -i 's/return \[\.\.\.quadIsolation, \.\.\.hingeFallbacks\]\.slice(0, limit);/return [...quadIsolation, ...hingeFallbacks];/' src/lib/program/alternatives.ts

# Restore backup
cp "$BACKUP_DIR/alternatives.ts" src/lib/program/alternatives.ts

echo
echo "=== Mutant Testing Summary ==="
echo "Tested: $mutants_tested"
echo "Killed: $mutants_killed"
echo "Survived: $mutants_survived"
echo "Crashed: $mutants_crashed"
echo "Skipped: $mutants_skipped"

if [ "$mutants_survived" -gt 0 ] || [ "$mutants_crashed" -gt 0 ] || [ "$mutants_skipped" -gt 0 ]; then
  echo
  echo "✗ FAILED: Some mutants survived, crashed, or were skipped"
  exit 1
fi

echo
echo "✓ PASSED: All mutants killed"
exit 0
