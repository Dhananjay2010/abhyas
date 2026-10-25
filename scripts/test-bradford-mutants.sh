#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for Bradford/behind-the-neck exclusions
# Tests that removing any Bradford slug from the exclusion set is caught

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXCLUSIONS_FILE="$SCRIPT_DIR/../src/lib/program/exclusions.ts"
GENERATE_FILE="$SCRIPT_DIR/../src/lib/program/generate.ts"

# Create unique temporary backup files
EXCLUSIONS_BACKUP=$(mktemp)
GENERATE_BACKUP=$(mktemp)

# Take both backups ONCE before any mutations
cp "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"
cp "$GENERATE_FILE" "$GENERATE_BACKUP"

cleanup() {
  if [ -s "$EXCLUSIONS_BACKUP" ]; then
    cp "$EXCLUSIONS_BACKUP" "$EXCLUSIONS_FILE" 2>/dev/null || true
  fi
  if [ -s "$GENERATE_BACKUP" ]; then
    cp "$GENERATE_BACKUP" "$GENERATE_FILE" 2>/dev/null || true
  fi
  rm -f "$EXCLUSIONS_BACKUP" "$GENERATE_BACKUP"
}

trap cleanup EXIT
trap 'cleanup; exit 1' INT TERM

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
if ! cmp -s "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"; then
  echo "  ✗ FATAL: Restore failed"
  exit 1
fi
echo ""

# Mutation 2: Remove standing-bradford-press from exclusion set
echo "2. Mutation: Remove standing-bradford-press from exclusion set"
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
if ! cmp -s "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"; then
  echo "  ✗ FATAL: Restore failed"
  exit 1
fi
echo ""

# Mutation 3: Remove around-the-worlds from shoulder contraindications
echo "3. Mutation: Remove around-the-worlds from SHOULDER_CONTRAINDICATED_SLUGS"

sed -i 's/"around-the-worlds",/\/\/ MUTANT: removed/' "$GENERATE_FILE"

# Verify mutation changed the file
if cmp -s "$GENERATE_FILE" "$GENERATE_BACKUP"; then
  echo "  ✗ FATAL: Mutation did not change the file"
  cleanup
  exit 1
fi

# Verify mutation marker is present
if ! grep -qF -- "// MUTANT: removed" "$GENERATE_FILE"; then
  echo "  ✗ FATAL: Mutation marker not found"
  cleanup
  exit 1
fi

if ! run_test_and_verify_caught "Remove around-the-worlds"; then
  cleanup
  exit 1
fi

# Restore
cp "$GENERATE_BACKUP" "$GENERATE_FILE"
if ! cmp -s "$GENERATE_FILE" "$GENERATE_BACKUP"; then
  echo "  ✗ FATAL: Restore failed"
  exit 1
fi
echo ""

# Mutation 4: Add around-the-worlds to EXCLUDED_EXERCISE_SLUGS (must be killed)
echo "4. Mutation: Add around-the-worlds to EXCLUDED_EXERCISE_SLUGS (ATW global)"

# Add ATW to the global exclusion set
sed -i '/export const EXCLUDED_EXERCISE_SLUGS.*Set\(\[/,/\]\);/ {
  /\]\);/i\
  "around-the-worlds", \/\/ MUTANT: ATW should NOT be globally excluded
}' "$EXCLUSIONS_FILE"

# Verify mutation changed the file
if cmp -s "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"; then
  echo "  ✗ FATAL: Mutation did not change the file"
  cleanup
  exit 1
fi

# Verify mutation marker is present
if ! grep -qF -- "// MUTANT: ATW should NOT be globally excluded" "$EXCLUSIONS_FILE"; then
  echo "  ✗ FATAL: Mutation marker not found"
  cleanup
  exit 1
fi

if ! run_test_and_verify_caught "Add ATW to EXCLUDED_EXERCISE_SLUGS"; then
  cleanup
  exit 1
fi

# Restore
cp "$EXCLUSIONS_BACKUP" "$EXCLUSIONS_FILE"
if ! cmp -s "$EXCLUSIONS_FILE" "$EXCLUSIONS_BACKUP"; then
  echo "  ✗ FATAL: Restore failed"
  exit 1
fi
echo ""

echo "=== Mutation Testing Results ==="
echo "✓ All mutations caught"
exit 0
