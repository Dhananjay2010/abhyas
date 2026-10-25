#!/usr/bin/env bash
# Mutant test for buildSessionSummary (FIX a)
#
# Mutants:
# M1: Skip exercises with no prior_progress
# M2: Return empty array (simulating lost client state)
# M3: Filter out exercises where feel is null

set -euo pipefail

TEMP=$(mktemp -d)
trap 'CODE=$?; cp "$BACKUP" "$SRC" 2>/dev/null || true; rm -rf "$TEMP"; exit $CODE' EXIT
trap 'cp "$BACKUP" "$SRC" 2>/dev/null || true; rm -rf "$TEMP"; exit 130' INT TERM

SRC="src/lib/session/build-session-summary.ts"
BACKUP="$TEMP/build-session-summary.ts.bak"

if [ ! -f "$SRC" ]; then
  echo "✗ Source file $SRC not found"
  exit 1
fi

cp "$SRC" "$BACKUP"

echo "Mutant tests for buildSessionSummary (FIX a)"
echo

# M1: Skip exercises with no prior_progress
echo "M1: Skip exercises with no prior_progress"
sed -i 's/if (ex.status === "skipped" || ex.sets.length === 0) continue;/if (ex.status === "skipped" || ex.sets.length === 0 || !ex.prior_progress) continue;/' "$SRC"

# Verify mutation
if ! cmp -s "$SRC" "$BACKUP"; then
  # Run test - must fail
  if npx tsx scripts/test-session-summary-from-db.ts >/dev/null 2>&1; then
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

# M2: Return empty array instead of DB summary
echo "M2: Return empty array (simulating lost client state)"
sed -i 's/return notes;/return [];/' "$SRC"

if ! cmp -s "$SRC" "$BACKUP"; then
  if npx tsx scripts/test-session-summary-from-db.ts >/dev/null 2>&1; then
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

# M3: Filter out exercises where feel is null
echo "M3: Filter out exercises where feel is null"
sed -i '/for (const ex of exercises) {/a\  if (!ex.feel) continue;' "$SRC"

if ! cmp -s "$SRC" "$BACKUP"; then
  if npx tsx scripts/test-session-summary-from-db.ts >/dev/null 2>&1; then
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
