#!/usr/bin/env bash
#
# Mutation tests for PR #124 in-scope code only:
# - Swap list builder / validator (buildEligibleSwapList)
# - Jump guard (lower-body check)
# - Olympic lifts (anyKneeInjury check)
# - Push press / thruster rules
#
# Exit 1 on any skip or survivor.

set -e

KILLED=0
SURVIVED=0
SKIPPED=0

echo "PR #124 In-Scope Mutation Testing"
echo "──────────────────────────────────────────────────────────"
echo ""

# Helper functions
mutate_file() {
  local file=$1
  local pattern=$2
  local replacement=$3
  
  cp "$file" "${file}.backup"
  
  if grep -q "$pattern" "$file"; then
    sed -i "s|$pattern|$replacement|" "$file"
    return 0
  else
    return 1
  fi
}

restore_file() {
  local file=$1
  if [ -f "${file}.backup" ]; then
    mv "${file}.backup" "$file"
  fi
}

run_mutant() {
  local name=$1
  local file=$2
  local pattern=$3
  local replacement=$4
  local test=$5
  
  echo ""
  echo "$name"
  
  if ! mutate_file "$file" "$pattern" "$replacement"; then
    echo "  ⊘ SKIP: Pattern not found"
    SKIPPED=$((SKIPPED + 1))
    restore_file "$file"
    return
  fi
  
  # Check if it compiles
  if ! npx tsc --noEmit 2>/dev/null; then
    echo "  ⊘ SKIP: Does not compile after mutation"
    SKIPPED=$((SKIPPED + 1))
    restore_file "$file"
    return
  fi
  
  # Run test
  if npm run "$test" >/dev/null 2>&1; then
    echo "  ✗ SURVIVED (test passed with mutation)"
    SURVIVED=$((SURVIVED + 1))
  else
    echo "  ✓ KILLED"
    KILLED=$((KILLED + 1))
  fi
  
  restore_file "$file"
}

# Jump guard: disable lower-body check
run_mutant \
  "Jump guard: allow all jumps regardless of muscle group" \
  "src/lib/program/past-knee.ts" \
  "const hasLowerBodyPrimary = ex.primary_muscles.some(m => lowerBodyMuscles.has(m));" \
  "const hasLowerBodyPrimary = false;" \
  "test:past-knee-jump-guard"

# Swap list: disable Olympic lift filter in alternatives
run_mutant \
  "Swap alternatives: skip Olympic lift check" \
  "src/lib/program/alternatives.ts" \
  "if (shouldExcludeOlympicLift(candidate, { currentInjuryRegions: ctx.injuryRegions, anyKneeInjury: ctx.anyKneeInjury, level: ctx.level })) continue;" \
  "if (false) continue;" \
  "test:olympic-lifts"

# Summary
echo ""
echo "──────────────────────────────────────────────────────────"
echo "Mutants killed:   $KILLED"
echo "Mutants survived: $SURVIVED"
echo "Mutants skipped:  $SKIPPED"
echo ""

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
else
  echo "✅ PASSED: All mutants killed"
  exit 0
fi
