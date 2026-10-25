#!/usr/bin/env bash
set -euo pipefail

# Test mutant-test-first-miss.sh safety in an isolated sandbox
# Guards the real source file and works with temporary copies

EXIT_CODE=0
SCRIPT="scripts/mutant-test-first-miss.sh"
REAL_FILE="src/lib/program/progression.ts"

echo "=== Testing Mutant Script Safety (Sandboxed) ==="
echo

# Guard: record sha256 of real source file
if [ ! -f "$REAL_FILE" ]; then
  echo "❌ ERROR: Real source file not found: $REAL_FILE"
  exit 1
fi

REAL_HASH_BEFORE=$(sha256sum "$REAL_FILE" | cut -d' ' -f1)
REAL_SIZE_BEFORE=$(stat -c%s "$REAL_FILE" 2>/dev/null || stat -f%z "$REAL_FILE" 2>/dev/null)
echo "🛡️  Guard: Real file before: ${REAL_HASH_BEFORE} (${REAL_SIZE_BEFORE} bytes)"
echo

# Create sandbox
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT

# Copy file to sandbox
SANDBOX_FILE="$SANDBOX/progression.ts"
cp "$REAL_FILE" "$SANDBOX_FILE"

# Helper: compute sha256
file_hash() {
  sha256sum "$1" | cut -d' ' -f1
}

# Test (a): Early exit (failing baseline) leaves file unchanged
echo "Test (a): Early exit with failing baseline..."
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
ORIGINAL_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  Original: ${ORIGINAL_HASH} (${ORIGINAL_SIZE} bytes)"

# Run script with failing baseline (using false)
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="false" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD="true" \
    bash "$SCRIPT" > /dev/null 2>&1 || true

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"

if [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped to 0 bytes"
  EXIT_CODE=1
elif [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
  echo "  ❌ FAIL: File content changed"
  EXIT_CODE=1
else
  echo "  ✅ PASS: File unchanged"
fi
echo

# Test (b): Backup failure aborts before mutation
echo "Test (b): Backup failure aborts before mutation..."

# Reset sandbox file
cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
echo "  Original: ${ORIGINAL_HASH}"

# Create a modified version of script that corrupts the backup
TEMP_SCRIPT="$SANDBOX/test-script.sh"
cat "$SCRIPT" > "$TEMP_SCRIPT"

# Insert backup corruption right after backup is created
sed -i '/^cp "\$FILE" "\$BACKUP"$/a\
# TEST INJECTION: Corrupt backup\
echo "" > "$BACKUP"' "$TEMP_SCRIPT"

# Run the modified script
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="true" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD="true" \
    bash "$TEMP_SCRIPT" > /dev/null 2>&1 || true

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"

if [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped despite backup failure"
  EXIT_CODE=1
elif [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
  echo "  ❌ FAIL: File was mutated despite backup failure"
  EXIT_CODE=1
else
  echo "  ✅ PASS: Script aborted, file unchanged"
fi
echo

# Test (c1): All mutants killed - real script restores correctly
echo "Test (c1): All mutants killed (normal run)..."

# Reset sandbox file
cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
ORIGINAL_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  Original: ${ORIGINAL_HASH} (${ORIGINAL_SIZE} bytes)"

# Run real script: baseline passes, mutations applied but all killed (tests fail)
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="true" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD="false" \
    bash "$SCRIPT" > /dev/null 2>&1 || true

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"

if [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped after mutant run"
  EXIT_CODE=1
elif [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
  echo "  ❌ FAIL: File was not restored after mutations"
  EXIT_CODE=1
else
  echo "  ✅ PASS: File correctly restored after all mutations"
fi
echo

# Test (c2): Interrupted mid-mutation - trap restores correctly
echo "Test (c2): Interrupted mid-mutation (exit during test)..."

# Reset sandbox file
cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
ORIGINAL_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  Original: ${ORIGINAL_HASH} (${ORIGINAL_SIZE} bytes)"

# Run real script: exit 3 during test (mutation applied, then abrupt exit)
set +e
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="true" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD="exit 3" \
    bash "$SCRIPT" > /dev/null 2>&1
SCRIPT_EXIT=$?
set -e

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"
echo "  Script exit code: $SCRIPT_EXIT"

if [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped after interrupt"
  EXIT_CODE=1
elif [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
  echo "  ❌ FAIL: Trap did not restore after interrupt"
  EXIT_CODE=1
elif [ "$SCRIPT_EXIT" -eq 0 ]; then
  echo "  ❌ FAIL: Script exited 0 despite interrupt"
  EXIT_CODE=1
else
  echo "  ✅ PASS: Trap restored file, script exited non-zero"
fi
echo

# Guard check: verify real source file is untouched
echo "🛡️  Guard: Checking real source file..."
REAL_HASH_AFTER=$(sha256sum "$REAL_FILE" | cut -d' ' -f1)
REAL_SIZE_AFTER=$(stat -c%s "$REAL_FILE" 2>/dev/null || stat -f%z "$REAL_FILE" 2>/dev/null)
echo "  Real file after: ${REAL_HASH_AFTER} (${REAL_SIZE_AFTER} bytes)"

if [ "$REAL_HASH_AFTER" != "$REAL_HASH_BEFORE" ] || [ "$REAL_SIZE_AFTER" != "$REAL_SIZE_BEFORE" ]; then
  echo "  ❌ CRITICAL: Real source file was modified!"
  EXIT_CODE=1
else
  echo "  ✅ Real source file untouched"
fi
echo

echo "========================================="
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ ALL SAFETY TESTS PASSED"
else
  echo "❌ SOME SAFETY TESTS FAILED"
fi
echo "========================================="

exit $EXIT_CODE
