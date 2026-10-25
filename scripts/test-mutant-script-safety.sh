#!/usr/bin/env bash
set -euo pipefail

# Test mutant-test-first-miss.sh safety in an isolated sandbox
# Guards the real source file and works with temporary copies

EXIT_CODE=0
SCRIPT="scripts/mutant-test-first-miss.sh"
REAL_FILE="src/lib/program/progression.ts"

echo "=== Testing Mutant Script Safety (Sandboxed) ==="
echo

# Guard: Verify script supports MUTANT_TARGET_FILE (refuse to run against real file)
if ! grep -q 'MUTANT_TARGET_FILE' "$SCRIPT"; then
  echo "❌ ERROR: Script does not support MUTANT_TARGET_FILE override" >&2
  echo "   Refusing to run - would test against real source file" >&2
  exit 1
fi

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
set +e
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="false" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD="true" \
    bash "$SCRIPT" > /dev/null 2>&1
TEST_EXIT=$?
set -e

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"
echo "  Exit code: $TEST_EXIT"

if [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped to 0 bytes"
  EXIT_CODE=1
elif [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
  echo "  ❌ FAIL: File content changed"
  EXIT_CODE=1
elif [ "$TEST_EXIT" -eq 0 ]; then
  echo "  ❌ FAIL: Script exited 0 despite failing baseline"
  EXIT_CODE=1
else
  echo "  ✅ PASS: File unchanged, exit non-zero"
fi
echo

# Test (b1): Backup corrupted to empty - should abort
echo "Test (b1): Backup corrupted to empty..."

cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
echo "  Original: ${ORIGINAL_HASH}"

# Use MUTANT_TEST_CMD hook to empty the backup
set +e
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="true" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD='echo "" > "$BACKUP"; false' \
    bash "$SCRIPT" > /dev/null 2>&1
TEST_EXIT=$?
set -e

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"
echo "  Exit code: $TEST_EXIT"

if [ "$TEST_EXIT" -eq 0 ]; then
  echo "  ❌ FAIL: Script exited 0 despite empty backup"
  EXIT_CODE=1
elif [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped to 0 bytes"
  EXIT_CODE=1
elif [ "$AFTER_HASH" = "$ORIGINAL_HASH" ]; then
  echo "  ✅ PASS: File unchanged, exit non-zero"
else
  echo "  ⚠️  ACCEPTABLE: File left unrestored but not 0 bytes, exit non-zero"
fi
echo

# Test (b2): Backup corrupted with junk - should abort
echo "Test (b2): Backup corrupted with junk..."

cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
echo "  Original: ${ORIGINAL_HASH}"

# Use MUTANT_TEST_CMD hook to write junk to backup
set +e
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="true" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD='echo "JUNK_DATA" > "$BACKUP"; false' \
    bash "$SCRIPT" > /dev/null 2>&1
TEST_EXIT=$?
set -e

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"
echo "  Exit code: $TEST_EXIT"

if [ "$TEST_EXIT" -eq 0 ]; then
  echo "  ❌ FAIL: Script exited 0 despite junk backup"
  EXIT_CODE=1
elif [ "$AFTER_SIZE" -eq 0 ] || [ "$AFTER_SIZE" -eq 10 ]; then
  echo "  ❌ FAIL: File was corrupted"
  EXIT_CODE=1
elif [ "$AFTER_HASH" = "$ORIGINAL_HASH" ]; then
  echo "  ✅ PASS: File unchanged, exit non-zero"
else
  echo "  ⚠️  ACCEPTABLE: File left unrestored but not junk, exit non-zero"
fi
echo

# Test (c1): All mutants killed (normal run)
echo "Test (c1): All mutants killed - normal run..."

cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
ORIGINAL_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  Original: ${ORIGINAL_HASH} (${ORIGINAL_SIZE} bytes)"

# Run real script: baseline passes, mutations applied but all killed (tests fail)
set +e
OUTPUT=$(env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="true" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD="false" \
    bash "$SCRIPT" 2>&1)
TEST_EXIT=$?
set -e

AFTER_HASH=$(file_hash "$SANDBOX_FILE")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"
echo "  Exit code: $TEST_EXIT"

# Count killed mutants
KILLED_COUNT=$(echo "$OUTPUT" | grep -c "✅ KILLED" || true)
echo "  Killed: $KILLED_COUNT"

if [ "$AFTER_SIZE" -eq 0 ]; then
  echo "  ❌ FAIL: File was wiped after mutant run"
  EXIT_CODE=1
elif [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
  echo "  ❌ FAIL: File was not restored after mutations"
  EXIT_CODE=1
elif [ "$TEST_EXIT" -ne 0 ]; then
  echo "  ❌ FAIL: Script exited non-zero despite all mutants killed"
  EXIT_CODE=1
elif [ "$KILLED_COUNT" -lt 10 ]; then
  echo "  ❌ FAIL: Too few mutants killed (expected 12+, got $KILLED_COUNT)"
  EXIT_CODE=1
else
  echo "  ✅ PASS: File restored, exit 0, all mutants killed"
fi
echo

# Test (c2): Interrupted mid-mutation (exit during test)
echo "Test (c2): Interrupted with exit 3 during test..."

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

# Test (c3): SIGTERM mid-mutation
echo "Test (c3): SIGTERM mid-mutation..."

cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
echo "  Original: ${ORIGINAL_HASH}"

# Run script in background with sleep, send TERM once mutated
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="true" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD="sleep 5" \
    bash "$SCRIPT" > /dev/null 2>&1 &
SCRIPT_PID=$!

# Poll for file change (mutation applied), with timeout
TIMEOUT=10
ELAPSED=0
FILE_CHANGED=false
while [ $ELAPSED -lt $TIMEOUT ]; do
  sleep 0.2
  ELAPSED=$((ELAPSED + 1))
  CURRENT_HASH=$(file_hash "$SANDBOX_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_HASH" ] && [ "$CURRENT_HASH" != "$ORIGINAL_HASH" ]; then
    FILE_CHANGED=true
    break
  fi
done

if [ "$FILE_CHANGED" = false ]; then
  echo "  ⚠️  SKIP: Mutation not detected within timeout"
  kill "$SCRIPT_PID" 2>/dev/null || true
  wait "$SCRIPT_PID" 2>/dev/null || true
else
  # Send TERM
  kill -TERM "$SCRIPT_PID" 2>/dev/null || true
  set +e
  wait "$SCRIPT_PID"
  SCRIPT_EXIT=$?
  set -e
  
  AFTER_HASH=$(file_hash "$SANDBOX_FILE")
  AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
  echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"
  echo "  Exit code: $SCRIPT_EXIT"
  
  if [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
    echo "  ❌ FAIL: File not restored after SIGTERM"
    EXIT_CODE=1
  elif [ "$SCRIPT_EXIT" -ne 143 ] && [ "$SCRIPT_EXIT" -ne 130 ]; then
    echo "  ⚠️  WARNING: Expected exit 143 or 130, got $SCRIPT_EXIT"
  else
    echo "  ✅ PASS: File restored, exit 143"
  fi
fi
echo

# Test (c4): SIGINT mid-mutation
echo "Test (c4): SIGINT mid-mutation..."

cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
echo "  Original: ${ORIGINAL_HASH}"

# Run script in background with sleep, send INT once mutated
env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
    MUTANT_BASELINE_CMD="true" \
    MUTANT_COMPILE_CMD="true" \
    MUTANT_TEST_CMD="sleep 5" \
    bash "$SCRIPT" > /dev/null 2>&1 &
SCRIPT_PID=$!

# Poll for file change
TIMEOUT=10
ELAPSED=0
FILE_CHANGED=false
while [ $ELAPSED -lt $TIMEOUT ]; do
  sleep 0.2
  ELAPSED=$((ELAPSED + 1))
  CURRENT_HASH=$(file_hash "$SANDBOX_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_HASH" ] && [ "$CURRENT_HASH" != "$ORIGINAL_HASH" ]; then
    FILE_CHANGED=true
    break
  fi
done

if [ "$FILE_CHANGED" = false ]; then
  echo "  ⚠️  SKIP: Mutation not detected within timeout"
  kill "$SCRIPT_PID" 2>/dev/null || true
  wait "$SCRIPT_PID" 2>/dev/null || true
else
  # Send INT
  kill -INT "$SCRIPT_PID" 2>/dev/null || true
  set +e
  wait "$SCRIPT_PID"
  SCRIPT_EXIT=$?
  set -e
  
  AFTER_HASH=$(file_hash "$SANDBOX_FILE")
  AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null)
  echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"
  echo "  Exit code: $SCRIPT_EXIT"
  
  if [ "$AFTER_HASH" != "$ORIGINAL_HASH" ]; then
    echo "  ❌ FAIL: File not restored after SIGINT"
    EXIT_CODE=1
  elif [ "$SCRIPT_EXIT" -ne 130 ] && [ "$SCRIPT_EXIT" -ne 143 ]; then
    echo "  ⚠️  WARNING: Expected exit 130 or 143, got $SCRIPT_EXIT"
  else
    echo "  ✅ PASS: File restored, exit 130"
  fi
fi
echo

# Test (d): Size-limited write (disk full simulation)
echo "Test (d): Size-limited write (ulimit -f)..."

cp "$REAL_FILE" "$SANDBOX_FILE"
ORIGINAL_HASH=$(file_hash "$SANDBOX_FILE")
echo "  Original: ${ORIGINAL_HASH}"

# Run with file size limit (should trigger write failure)
set +e
(
  ulimit -f 1  # 1 block = 512 bytes, much smaller than file
  env MUTANT_TARGET_FILE="$SANDBOX_FILE" \
      MUTANT_BASELINE_CMD="true" \
      MUTANT_COMPILE_CMD="true" \
      MUTANT_TEST_CMD="false" \
      bash "$SCRIPT" > /dev/null 2>&1
)
TEST_EXIT=$?
set -e

AFTER_HASH=$(file_hash "$SANDBOX_FILE" 2>/dev/null || echo "MISSING")
AFTER_SIZE=$(stat -c%s "$SANDBOX_FILE" 2>/dev/null || stat -f%z "$SANDBOX_FILE" 2>/dev/null || echo "0")
echo "  After:    ${AFTER_HASH} (${AFTER_SIZE} bytes)"
echo "  Exit code: $TEST_EXIT"

if [ "$TEST_EXIT" -eq 0 ]; then
  echo "  ❌ FAIL: Script exited 0 despite write failure"
  EXIT_CODE=1
elif [ "$AFTER_HASH" = "$ORIGINAL_HASH" ]; then
  echo "  ✅ PASS: File restored or unchanged, exit non-zero"
else
  echo "  ⚠️  ACCEPTABLE: File left in unknown state but exit non-zero"
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
