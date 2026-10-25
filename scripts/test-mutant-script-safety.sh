#!/usr/bin/env bash
set -euo pipefail

# Test mutant-test-first-miss.sh safety:
# (a) Early exit leaves file unchanged
# (b) Backup failure aborts before mutation
# (c) Normal restore works correctly

SCRIPT="scripts/mutant-test-first-miss.sh"
TARGET_FILE="src/lib/program/progression.ts"
EXIT_CODE=0

echo "=== Testing Mutant Script Safety ==="
echo

# Helper: compute sha256 of a file
file_hash() {
  sha256sum "$1" | cut -d' ' -f1
}

# Test (a): Early exit (failing baseline) leaves file unchanged
echo "Test (a): Early exit with failing baseline..."
ORIGINAL_HASH=$(file_hash "$TARGET_FILE")
ORIGINAL_SIZE=$(stat -c%s "$TARGET_FILE" 2>/dev/null || stat -f%z "$TARGET_FILE" 2>/dev/null)

if [ "$ORIGINAL_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: Original file is already empty (${ORIGINAL_SIZE} bytes)"
  EXIT_CODE=1
else
  echo "  Original: ${ORIGINAL_HASH} (${ORIGINAL_SIZE} bytes)"
fi

# Create a wrapper that forces early exit by making baseline tests fail
cat > /tmp/test-early-exit.sh << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

# Temporarily break the baseline test to force early exit
NPM_ORIGINAL=$(which npm)
cat > /tmp/fake-npm << 'FAKE_NPM'
#!/usr/bin/env bash
if [[ "$*" == *"test:first-miss-pinned"* ]]; then
  # Make baseline fail on first call, succeed on others
  if [ ! -f /tmp/baseline-called ]; then
    touch /tmp/baseline-called
    exit 1
  fi
fi
exec REAL_NPM "$@"
FAKE_NPM
sed -i "s|REAL_NPM|$NPM_ORIGINAL|g" /tmp/fake-npm
chmod +x /tmp/fake-npm

# Run the script with fake npm
export PATH="/tmp:$PATH"
bash scripts/mutant-test-first-miss.sh 2>&1 || true

# Clean up
rm -f /tmp/fake-npm /tmp/baseline-called
WRAPPER
chmod +x /tmp/test-early-exit.sh

# Run the wrapper
bash /tmp/test-early-exit.sh > /dev/null 2>&1 || true

# Check that file is unchanged
AFTER_HASH=$(file_hash "$TARGET_FILE")
AFTER_SIZE=$(stat -c%s "$TARGET_FILE" 2>/dev/null || stat -f%z "$TARGET_FILE" 2>/dev/null)

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

rm -f /tmp/test-early-exit.sh
echo

# Test (b): Backup failure aborts before mutation
echo "Test (b): Backup failure aborts before mutation..."

# Create a modified version of the script that simulates backup failure
TEMP_SCRIPT=$(mktemp)
cat "$SCRIPT" > "$TEMP_SCRIPT"

# Insert a backup corruption step right after the backup is created
sed -i '/^cp "$FILE" "$BACKUP"$/a\
# TEST INJECTION: Corrupt backup to simulate backup failure\
echo "" > "$BACKUP"' "$TEMP_SCRIPT"

ORIGINAL_HASH=$(file_hash "$TARGET_FILE")
echo "  Original: ${ORIGINAL_HASH}"

# Run the modified script (should abort early)
bash "$TEMP_SCRIPT" > /dev/null 2>&1 || true

# Check that file is unchanged (because script aborted)
AFTER_HASH=$(file_hash "$TARGET_FILE")
AFTER_SIZE=$(stat -c%s "$TARGET_FILE" 2>/dev/null || stat -f%z "$TARGET_FILE" 2>/dev/null)

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

rm -f "$TEMP_SCRIPT"
echo

# Test (c): Normal run restores correctly
echo "Test (c): Normal run restores correctly..."
ORIGINAL_HASH=$(file_hash "$TARGET_FILE")
ORIGINAL_SIZE=$(stat -c%s "$TARGET_FILE" 2>/dev/null || stat -f%z "$TARGET_FILE" 2>/dev/null)

echo "  Original: ${ORIGINAL_HASH} (${ORIGINAL_SIZE} bytes)"

# Run the actual script (it may pass or fail mutant tests, we don't care)
# We just want to ensure the file is restored
bash "$SCRIPT" > /dev/null 2>&1 || true

# Check that file is restored to original state
AFTER_HASH=$(file_hash "$TARGET_FILE")
AFTER_SIZE=$(stat -c%s "$TARGET_FILE" 2>/dev/null || stat -f%z "$TARGET_FILE" 2>/dev/null)

echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"

if [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped after script run"
  EXIT_CODE=1
elif [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
  echo "  ❌ FAIL: File was not restored to original state"
  EXIT_CODE=1
else
  echo "  ✅ PASS: File correctly restored"
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
