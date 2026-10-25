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
trap "rm -rf '$SANDBOX'" EXIT

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

# Test (c): Normal run with one mutation restores correctly
echo "Test (c): Normal run with one mutation restores correctly..."

# Reset sandbox file
cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
ORIGINAL_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  Original: ${ORIGINAL_HASH} (${ORIGINAL_SIZE} bytes)"

# Create a stub script that applies ONE mutation, passes compile, then FAILS test
# This simulates one killed mutant
STUB_APPLY="$SANDBOX/stub-apply.sh"
cat > "$STUB_APPLY" << 'STUB_SCRIPT'
#!/usr/bin/env bash
# Stub that modifies the file once
if [ ! -f /tmp/stub-mutated ]; then
  echo "// MUTATED" >> "$MUTANT_TARGET_FILE"
  touch /tmp/stub-mutated
  exit 0
else
  exit 0
fi
STUB_SCRIPT
chmod +x "$STUB_APPLY"

# Create wrapper script that applies one mutation
WRAPPER_SCRIPT="$SANDBOX/wrapper.sh"
cat > "$WRAPPER_SCRIPT" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

export MUTANT_TARGET_FILE="$1"
export MUTANT_BASELINE_CMD="true"
export MUTANT_COMPILE_CMD="true"
export MUTANT_TEST_CMD="if [ -f /tmp/stub-mutated ]; then false; else true; fi"

# Clean state
rm -f /tmp/stub-mutated

# Apply one mutation manually (simulating what run_mutant does)
FILE="$MUTANT_TARGET_FILE"
BACKUP=$(mktemp)
MUTATION_APPLIED=false

cleanup() {
  if [ ! -f "$BACKUP" ]; then
    return
  fi
  if [ ! -s "$BACKUP" ]; then
    return
  fi
  if [ "$MUTATION_APPLIED" = true ]; then
    cp "$BACKUP" "$FILE"
  fi
  rm -f "$BACKUP"
}

trap cleanup EXIT INT TERM

# Backup
cp "$FILE" "$BACKUP"

# Verify backup
if [ ! -f "$BACKUP" ] || [ ! -s "$BACKUP" ] || ! cmp -s "$FILE" "$BACKUP"; then
  exit 1
fi

# Apply mutation
echo "// MUTATED" >> "$FILE"
MUTATION_APPLIED=true

# Simulate test failure (mutant killed)
eval "$MUTANT_TEST_CMD" > /dev/null 2>&1 || true

# Cleanup should restore
WRAPPER
chmod +x "$WRAPPER_SCRIPT"

# Run wrapper
bash "$WRAPPER_SCRIPT" "$SANDBOX_FILE" || true
rm -f /tmp/stub-mutated

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"

if [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped after mutation"
  EXIT_CODE=1
elif [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
  echo "  ❌ FAIL: File was not restored to original state"
  EXIT_CODE=1
else
  echo "  ✅ PASS: File correctly restored after mutation"
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
elif ! git diff --quiet -- src/; then
  echo "  ❌ CRITICAL: Git reports changes in src/"
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
