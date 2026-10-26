#!/usr/bin/env bash
# Test mutant: slice to 5 BEFORE filtering (the original bug from PR #152)
# This mutant moves the slice before the past-knee squat swap reordering,
# which causes short lists when hinges are filtered out early.

set -euo pipefail

MUTANT_DIR=$(mktemp -d)
trap "rm -rf '$MUTANT_DIR'" EXIT

echo "=== Testing Past-Knee Squat Swap Slice-Order Mutant ==="
echo

# Apply mutant: move effectiveLimit back to regular limit for past-knee squats
cp src/lib/program/alternatives.ts "$MUTANT_DIR/alternatives.ts.backup"

sed -i 's/const effectiveLimit = isPastKneeSquatSwap ? 20 : limit;/const effectiveLimit = limit;/' src/lib/program/alternatives.ts

echo "Running test:past-knee-squat-swap-lengths..."
if npm run test:past-knee-squat-swap-lengths > /dev/null 2>&1; then
  echo "✗ SURVIVED: Mutant was not killed"
  cp "$MUTANT_DIR/alternatives.ts.backup" src/lib/program/alternatives.ts
  exit 1
else
  echo "✓ KILLED: Test detected the mutant"
  cp "$MUTANT_DIR/alternatives.ts.backup" src/lib/program/alternatives.ts
  exit 0
fi
