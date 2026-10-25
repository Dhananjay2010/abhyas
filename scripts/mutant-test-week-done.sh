#!/usr/bin/env bash
# Mutant test for computeCompletedDays (FIX b)
#
# Mutants:
# M1: Don't mark yoga/breathing as done (only strength)
# M2: Mark in_progress as done (missing status check)
# M3: Return empty set (no done marking at all)

set -euo pipefail

TEMP=$(mktemp -d)
trap 'CODE=$?; cp "$BACKUP" "$SRC" 2>/dev/null || true; rm -rf "$TEMP"; exit $CODE' EXIT
trap 'cp "$BACKUP" "$SRC" 2>/dev/null || true; rm -rf "$TEMP"; exit 130' INT TERM

SRC="src/lib/today/completed-days.ts"
BACKUP="$TEMP/completed-days.ts.bak"

if [ ! -f "$SRC" ]; then
  echo "✗ Source file $SRC not found"
  exit 1
fi

cp "$SRC" "$BACKUP"

echo "Mutant tests for computeCompletedDays (FIX b)"
echo

# M1: Don't mark yoga/breathing as done (only strength)
echo "M1: Only mark strength sessions as done"
sed -i 's/if (s.status === "completed") {/if (s.status === "completed" \&\& (s.actual_type === "weights" || s.actual_type === "bodyweight")) {/' "$SRC"

# Verify mutation
if ! cmp -s "$SRC" "$BACKUP"; then
  # Run test - must fail
  if npx tsx scripts/test-week-done.ts >/dev/null 2>&1; then
    echo "  ✗ M1: Test passed but should have failed (mutant survived)"
    cp "$BACKUP" "$SRC"
    exit 1
  else
    echo "  ✓ M1: Test failed as expected (mutant killed)"
  fi
else
  echo "  ✗ M1: Mutation failed to apply"
  exit 1
fi

# Restore
cp "$BACKUP" "$SRC"

# M2: Mark in_progress as done (missing status check)
echo "M2: Don't check status (marks in_progress as done)"
sed -i 's/if (s.status === "completed") {/if (true) {/' "$SRC"

if ! cmp -s "$SRC" "$BACKUP"; then
  if npx tsx scripts/test-week-done.ts >/dev/null 2>&1; then
    echo "  ✗ M2: Test passed but should have failed (mutant survived)"
    cp "$BACKUP" "$SRC"
    exit 1
  else
    echo "  ✓ M2: Test failed as expected (mutant killed)"
  fi
else
  echo "  ✗ M2: Mutation failed to apply"
  exit 1
fi

cp "$BACKUP" "$SRC"

# M3: Return empty set (no done marking)
echo "M3: Return empty set (no done marking)"
sed -i 's/completed.add(s.local_date);/\/\/ completed.add(s.local_date);/' "$SRC"

if ! cmp -s "$SRC" "$BACKUP"; then
  if npx tsx scripts/test-week-done.ts >/dev/null 2>&1; then
    echo "  ✗ M3: Test passed but should have failed (mutant survived)"
    cp "$BACKUP" "$SRC"
    exit 1
  else
    echo "  ✓ M3: Test failed as expected (mutant killed)"
  fi
else
  echo "  ✗ M3: Mutation failed to apply"
  exit 1
fi

cp "$BACKUP" "$SRC"

# Final check: source must be unmodified
if ! git diff --quiet "$SRC"; then
  echo "  ✗ Source file was not properly restored"
  exit 1
fi

echo
echo "✅ All 3 mutants killed, source restored"
