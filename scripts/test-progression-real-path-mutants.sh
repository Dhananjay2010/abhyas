#!/bin/bash
# Mutant testing for buildProgressionInput (real production path)
# Applies mutants to src/lib/session/build-progression-input.ts and verifies they kill the test
# Uses temporary copies to avoid leaving backup files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_FILE="$SCRIPT_DIR/../src/lib/session/build-progression-input.ts"
TEMP_DIR=$(mktemp -d)
trap "cp '$TEMP_DIR/build-progression-input.ts.orig' '$SRC_FILE' 2>/dev/null || true; rm -rf '$TEMP_DIR'" EXIT

echo "=== Mutant Testing: buildProgressionInput (HIGH-2) ==="
echo ""

# Save original
cp "$SRC_FILE" "$TEMP_DIR/build-progression-input.ts.orig"

# Mutant 1: repsMin <- planned_reps_max (brings the bug back)
echo "=== MUTANT 1: repsMin <- planned_reps_max ==="
echo "This brings back the original bug: 4×10 in 8-12 becomes a miss"
cp "$TEMP_DIR/build-progression-input.ts.orig" "$SRC_FILE"
sed -i 's/repsMin: sessionExercise\.planned_reps_min ?? 8,/repsMin: sessionExercise.planned_reps_max ?? 12, \/\/ MUTANT: wired to max/' "$SRC_FILE"

echo "Running test with mutant..."
if npx tsx scripts/test-progression-real-path.ts 2>&1 | tee "$TEMP_DIR/mutant1-output.txt" | grep -q "FAIL"; then
  echo "✓ MUTANT 1 KILLED: Test failed as expected"
  grep "FAIL\|In-range" "$TEMP_DIR/mutant1-output.txt" | head -5
else
  echo "✗ MUTANT 1 ESCAPED!"
  exit 1
fi

echo ""

# Mutant 2: repsMin dropped (defaulting to 0)
echo "=== MUTANT 2: repsMin dropped ==="
echo "Remove repsMin from the return, making it undefined"
cp "$TEMP_DIR/build-progression-input.ts.orig" "$SRC_FILE"
# Remove the repsMin line from the return statement
sed -i '/repsMin: sessionExercise\.planned_reps_min ?? 8,/d' "$SRC_FILE"

echo "Running test with mutant..."
if npx tsx scripts/test-progression-real-path.ts 2>&1 | tee "$TEMP_DIR/mutant2-output.txt" | grep -q "FAIL\|error\|Error"; then
  echo "✓ MUTANT 2 KILLED: Test failed as expected"
  grep "FAIL\|error\|Error\|Miss" "$TEMP_DIR/mutant2-output.txt" | head -5
else
  echo "✗ MUTANT 2 ESCAPED!"
  exit 1
fi

echo ""

# Mutant 3: wrong state weight source
echo "=== MUTANT 3: state weight from best_weight_kg instead of current_working_weight_kg ==="
cp "$TEMP_DIR/build-progression-input.ts.orig" "$SRC_FILE"
sed -i 's/currentWorkingWeightKg:/currentWorkingWeightKg: \/\/ MUTANT: wrong field/' "$SRC_FILE"
sed -i '/currentWorkingWeightKg: \/\/ MUTANT:/,+3s/current_working_weight_kg/best_weight_kg/' "$SRC_FILE"

echo "Running test with mutant..."
if npx tsx scripts/test-progression-real-path.ts 2>&1 | tee "$TEMP_DIR/mutant3-output.txt" | grep -q "FAIL"; then
  echo "✓ MUTANT 3 KILLED: Test failed as expected"
  grep "FAIL" "$TEMP_DIR/mutant3-output.txt" | head -5
else
  echo "✗ MUTANT 3 ESCAPED!"
  exit 1
fi

echo ""

# Restore and verify
cp "$TEMP_DIR/build-progression-input.ts.orig" "$SRC_FILE"

echo "=== Verifying original passes ==="
if npx tsx scripts/test-progression-real-path.ts 2>&1 | grep -q "ALL CHECKS PASSED"; then
  echo "✓ Original restored and passes"
else
  echo "✗ Original should pass!"
  exit 1
fi

# Final safety check
if ! diff -q "$TEMP_DIR/build-progression-input.ts.orig" "$SRC_FILE" > /dev/null; then
  echo "✗ ERROR: File not properly restored!"
  cp "$TEMP_DIR/build-progression-input.ts.orig" "$SRC_FILE"
  exit 1
fi

echo ""
echo "=== ALL MUTANTS KILLED ==="
echo "✅ repsMin <- planned_reps_max: KILLED"
echo "✅ repsMin dropped: KILLED"
echo "✅ wrong state weight: KILLED"
echo "✅ inRange guard removed: KILLED (by test-progression-in-range-mutants.sh)"
