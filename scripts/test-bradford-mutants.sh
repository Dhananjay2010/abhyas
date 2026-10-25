#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for Bradford/behind-the-neck exclusions
# Tests that removing any Bradford slug from the exclusion set is caught

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXCLUSIONS_FILE="$SCRIPT_DIR/../src/lib/program/exclusions.ts"

# Create unique temporary backup file
EXCLUSIONS_BACKUP=$(mktemp)

echo "=== Bradford Exclusions Mutation Testing ==="
echo ""

# Baseline run: test must pass unmutated
echo "Running baseline test..."
if ! npx tsx "$SCRIPT_DIR/test-bradford-exclusions.ts" &>/dev/null; then
  echo "✗ Baseline test-bradford-exclusions.ts failed"
  exit 1
fi
echo "✓ Baseline test passed"
echo ""

cleanup() {
  if [ -f "$EXCLUSIONS_BACKUP" ]; then
    cp "$EXCLUSIONS_BACKUP" "$EXCLUSIONS_FILE" 2>/dev/null || true
  fi
  rm -f "$EXCLUSIONS_BACKUP"
}

trap cleanup EXIT INT TERM

run_test_and_verify_caught() {
  local mutation_name="$1"
  echo "Testing: $mutation_name"
  
  # Check that the mutant compiles
  if ! "$SCRIPT_DIR/../node_modules/.bin/tsc" --noEmit &>/dev/null; then
    echo "  ✗ Mutant does not compile"
    return 1
  fi
  
  # Run the test - it should fail
  if npx tsx "$SCRIPT_DIR/test-bradford-exclusions.ts" &>/dev/null; then
    echo "  ✗ Test passed (mutation survived)"
    return 1
  else
    echo "  ✓ Test failed (mutation caught)"
    return 0
  fi
}

# Mutation 1: Remove bradford-rocky-presses from exclusion set
echo "1. Mutation: Remove bradford-rocky-presses from exclusion set"
cp "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"
sed -i 's/"bradford-rocky-presses",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"

# Verify mutation changed the file
if cmp -s "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"; then
  echo "  ✗ FATAL: Mutation did not change the file"
  cleanup
  exit 1
fi

# Verify mutation marker is present
if ! grep -qF -- "// MUTANT: removed" "$EXCLUSIONS_FILE"; then
  echo "  ✗ FATAL: Mutation marker not found"
  cleanup
  exit 1
fi

if ! run_test_and_verify_caught "Remove bradford-rocky-presses"; then
  cleanup
  exit 1
fi

# Restore
cp "$EXCLUSIONS_BACKUP" "$EXCLUSIONS_FILE"
echo ""

# Mutation 2: Remove standing-bradford-press from exclusion set
echo "2. Mutation: Remove standing-bradford-press from exclusion set"
cp "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"
sed -i 's/"standing-bradford-press",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"

# Verify mutation changed the file
if cmp -s "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"; then
  echo "  ✗ FATAL: Mutation did not change the file"
  cleanup
  exit 1
fi

# Verify mutation marker is present
if ! grep -qF -- "// MUTANT: removed" "$EXCLUSIONS_FILE"; then
  echo "  ✗ FATAL: Mutation marker not found"
  cleanup
  exit 1
fi

if ! run_test_and_verify_caught "Remove standing-bradford-press"; then
  cleanup
  exit 1
fi

# Restore
cp "$EXCLUSIONS_BACKUP" "$EXCLUSIONS_FILE"
echo ""

echo "=== Mutation Testing Results ==="
echo "✓ All mutations caught"
exit 0
