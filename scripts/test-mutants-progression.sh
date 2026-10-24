#!/usr/bin/env bash
set -euo pipefail

# Real mutation testing script for progression grid rounding
# Plants mutants in the actual source, runs real tests, counts failures, reverts

PROG_FILE="src/lib/program/progression.ts"
MUTANT_COUNT=0
SURVIVED_COUNT=0

echo "=== MUTATION TESTING: progression grid rounding ==="
echo

# Helper to plant a mutant, test, and revert
test_mutant() {
  local name="$1"
  local pattern="$2"
  local replacement="$3"
  
  MUTANT_COUNT=$((MUTANT_COUNT + 1))
  echo "[$MUTANT_COUNT] $name"
  
  # Plant mutant
  if ! sed -i.bak "$pattern" "$PROG_FILE"; then
    echo "  ERROR: sed failed"
    mv "$PROG_FILE.bak" "$PROG_FILE" 2>/dev/null || true
    return 1
  fi
  
  # Run tests (capture failures)
  set +e
  npm test 2>&1 | grep -E '(FAIL|PASS|Error)' | head -20 > /tmp/mutant-test-output.txt
  local exit_code=$?
  set -e
  
  # Count failures
  local failures=0
  if grep -q 'FAIL' /tmp/mutant-test-output.txt || [ $exit_code -ne 0 ]; then
    failures=$(grep -c 'FAIL\|Error' /tmp/mutant-test-output.txt || echo 1)
  fi
  
  echo "  Failures: $failures"
  
  if [ "$failures" -eq 0 ]; then
    echo "  ⚠️  SURVIVED"
    SURVIVED_COUNT=$((SURVIVED_COUNT + 1))
  fi
  
  # Revert
  git checkout -- "$PROG_FILE" 2>/dev/null || mv "$PROG_FILE.bak" "$PROG_FILE"
  rm -f "$PROG_FILE.bak"
  
  echo
}

# Mutant 1: Remove rounding - round DOWN on progression (should round UP)
test_mutant \
  "Round DOWN on progression instead of UP" \
  's/Math\.ceil(target \/ step) \* step/Math.floor(target \/ step) \* step/g' \
  ""

# Mutant 2: Hard raises weight (remove hold)
test_mutant \
  "Hard raises weight (remove hold logic)" \
  's/feel === "hard"/feel === "never"/g' \
  ""

# Mutant 3: Failed set doesn't drop weight (skip back-off grid rounding)
test_mutant \
  "Failed set doesn't drop (skip grid on back-off)" \
  's/roundToGrid(backoff, equipmentIds, unit, "down")/backoff/g' \
  ""

# Mutant 4: Floor to 0 (remove minimum floor)
test_mutant \
  "Floor to 0 (remove minimum protection)" \
  's/Math\.max(.*equipmentMinimum.*)/0/g' \
  ""

# Mutant 5: Kettlebell jumps two bells (use compound increment)
test_mutant \
  "Kettlebell jumps two bells (wrong increment)" \
  's/meta\.mechanic === "compound" \? 2\.5 : 1\.25/5.0/g' \
  ""

# Mutant 6: Apply lb grid to kg values
test_mutant \
  "Apply lb grid to kg values (unit confusion)" \
  's/const effectiveUnit = unit \|\| "kg"/const effectiveUnit = "lb"/g' \
  ""

# Mutant 7: Skip rounding on deload
test_mutant \
  "Skip rounding on deload" \
  's/roundToGrid(deloadWeight, equipmentIds, unit, "down")/deloadWeight/g' \
  ""

# Mutant 8: Use increment instead of grid step on miss
test_mutant \
  "Use increment instead of grid step on miss" \
  's/const step = equipmentGridStep/const step = (meta.mechanic === "compound" ? 2.5 : 1.25); \/\/ equipmentGridStep/g' \
  ""

# Mutant 9: Progression rounds to nearest instead of up
test_mutant \
  "Progression rounds nearest (not up)" \
  's/Math\.ceil(value \/ gridStep)/Math.round(value \/ gridStep)/g' \
  ""

# Mutant 10: Non-loadable fallback disabled
test_mutant \
  "Non-loadable equipment fallback disabled" \
  "s/const effectiveEquipmentIds = hasLoadable ? equipmentIds : \\['barbell'\\];/const effectiveEquipmentIds = equipmentIds;/g" \
  ""

# Mutant 11: Grid step calculation returns 0
test_mutant \
  "Grid step returns 0 (breaks rounding)" \
  's/return Math\.max(\.\.\./return 0; \/\/ Math.max(/g' \
  ""

echo "==================================="
echo "Total mutants: $MUTANT_COUNT"
echo "Survived: $SURVIVED_COUNT"
echo

if [ "$SURVIVED_COUNT" -gt 0 ]; then
  echo "❌ MUTATION TEST FAILED: $SURVIVED_COUNT mutants survived"
  exit 1
else
  echo "✅ MUTATION TEST PASSED: All mutants killed"
  exit 0
fi
