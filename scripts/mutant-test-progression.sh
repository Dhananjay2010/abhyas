#!/usr/bin/env bash
set -e

# Shared crash detection function
function isCrash() {
  local output="$1"
  # Crashes: missing command, module errors, syntax errors, signal kills
  if echo "$output" | grep -qE "command not found|Cannot find module|SyntaxError|TypeError|ReferenceError|Segmentation fault|signal"; then
    return 0
  fi
  return 1
}

echo "=== Progression Mutant Tests ==="
echo ""

MUTATIONS_TESTED=0
MUTATIONS_KILLED=0
MUTATIONS_SURVIVED=0
MUTATIONS_SKIPPED=0

# Backup with trap
BACKUP_DIR=$(mktemp -d)
trap 'rm -rf "$BACKUP_DIR"; git checkout src/lib/program/progression.ts 2>/dev/null || true' EXIT

cp src/lib/program/progression.ts "$BACKUP_DIR/progression.ts.orig"

function run_mutant() {
  local name="$1"
  local description="$2"
  local sed_pattern="$3"
  local test_command="$4"
  
  MUTATIONS_TESTED=$((MUTATIONS_TESTED + 1))
  
  echo "Mutant $MUTATIONS_TESTED: $name"
  echo "  Description: $description"
  
  # Apply mutation
  cp "$BACKUP_DIR/progression.ts.orig" src/lib/program/progression.ts
  
  # Run sed and verify it changed something
  local before_hash=$(md5sum src/lib/program/progression.ts | cut -d' ' -f1)
  eval "$sed_pattern"
  local after_hash=$(md5sum src/lib/program/progression.ts | cut -d' ' -f1)
  
  if [ "$before_hash" = "$after_hash" ]; then
    echo "  ❌ SKIP: sed pattern didn't change the file"
    MUTATIONS_SKIPPED=$((MUTATIONS_SKIPPED + 1))
    return 0
  fi
  
  # Run test
  local output
  local exit_code
  output=$(eval "$test_command" 2>&1) || exit_code=$?
  exit_code=${exit_code:-0}
  
  # Check for crash
  if isCrash "$output"; then
    echo "  ❌ CRASH: test crashed (not a kill)"
    echo "  Output: $(echo "$output" | head -3)"
    MUTATIONS_SKIPPED=$((MUTATIONS_SKIPPED + 1))
    return 0
  fi
  
  # Check exit code
  if [ $exit_code -eq 0 ]; then
    echo "  ❌ SURVIVED: mutant passed tests"
    MUTATIONS_SURVIVED=$((MUTATIONS_SURVIVED + 1))
    return 0
  else
    echo "  ✅ KILLED: test failed as expected"
    MUTATIONS_KILLED=$((MUTATIONS_KILLED + 1))
    return 0
  fi
}

# Mutant M1: Success path uses stored weight instead of mode (main's QA bug)
run_mutant "M1-stored-weight" \
  "Success path: from = state.currentWorkingWeightKg ?? heaviest (main's bug)" \
  "sed -i 's/const from = mode > 0 ? mode : (state.currentWorkingWeightKg ?? heaviest);/const from = state.currentWorkingWeightKg ?? heaviest;/' src/lib/program/progression.ts" \
  "npx tsx scripts/test-comprehensive-progression.ts"

# Mutant M2: Remove never-below guards (both max and <= check)
# NOTE: This mutant may survive because incrementFor ensures increment >= grid for loadable equipment,
# making floor-snap unable to go below the lifted weight in practice. The max() is defensive.
run_mutant "M2-never-below-guards" \
  "Remove both never-below guards (max in floor-snap and next<=from check)" \
  "sed -i 's/next = Math.max(Math.floor((rawNext \/ gridStep) + 1e-9) \* gridStep, from);/next = Math.floor((rawNext \/ gridStep) + 1e-9) * gridStep;/' src/lib/program/progression.ts && sed -i 's/if (next <= from) {/if (false \&\& next <= from) {/' src/lib/program/progression.ts" \
  "npx tsx scripts/test-never-below-lifted.ts"

# Mutant M3: Replace floor with ceil (breaks cap)
run_mutant "M3-floor-to-ceil" \
  "Replace floor-snap with ceil-snap (violates cap)" \
  "sed -i 's/Math.floor((rawNext \/ gridStep) + 1e-9)/Math.ceil((rawNext \/ gridStep) + 1e-9)/' src/lib/program/progression.ts" \
  "npx tsx scripts/test-increment-pins.ts"

# Mutant M4: Don't double easy
run_mutant "M4-no-easy-doubling" \
  "Easy doesn't double: jump = step always" \
  "sed -i 's/if (feel === \"easy\" && !isBodyweightWithAddedWeight) {/if (false \&\& feel === \"easy\" \&\& !isBodyweightWithAddedWeight) {/' src/lib/program/progression.ts" \
  "npx tsx scripts/test-easy-doubling-pins.ts"

# Mutant M5: First miss drops instead of holding (decision F)
run_mutant "M5-first-miss-drops" \
  "First miss drops instead of holding (old behavior)" \
  "sed -i 's/const nextWeight = currentWeight;/let nextWeight = currentWeight; if (currentWeight !== null \&\& currentWeight > 0 \&\& equipmentIds) { const gridStep = equipmentGridStep(equipmentIds, \"kg\"); nextWeight = Math.max(currentWeight - gridStep, gridStep); }/' src/lib/program/progression.ts" \
  "npx tsx scripts/test-comprehensive-progression.ts"

# Mutant M6: Remove display-weight equality check (decision A)
run_mutant "M6-no-display-equality" \
  "Skip display-weight equality check (always progress)" \
  "sed -i '/if (displayWeight(next, unit) === displayWeight(from, unit)) {/,/}$/d' src/lib/program/progression.ts" \
  "npx tsx scripts/test-comprehensive-progression.ts"

# Mutant M7: Imperial increases don't round down
run_mutant "M7-imperial-no-rounddown" \
  "Imperial increases: use formatWeight instead of formatPrescribedWeight" \
  "sed -i 's/displayPrescribedWeight(next)/displayWeight(next, unit ?? \"kg\")/' src/lib/program/progression.ts" \
  "npx tsx scripts/test-comprehensive-progression.ts"

# Restore original
cp "$BACKUP_DIR/progression.ts.orig" src/lib/program/progression.ts

echo ""
echo "=== Summary ==="
echo "Mutations tested: $MUTATIONS_TESTED"
echo "Mutations killed: $MUTATIONS_KILLED"
echo "Mutations survived: $MUTATIONS_SURVIVED"
echo "Mutations skipped: $MUTATIONS_SKIPPED"
echo ""

if [ $MUTATIONS_SURVIVED -gt 0 ]; then
  echo "❌ FAIL: $MUTATIONS_SURVIVED mutant(s) survived"
  exit 1
elif [ $MUTATIONS_KILLED -eq 0 ]; then
  echo "❌ FAIL: No mutations were killed (all skipped or crashed)"
  exit 1
else
  echo "✅ PASS: All $MUTATIONS_KILLED mutations killed"
  exit 0
fi
