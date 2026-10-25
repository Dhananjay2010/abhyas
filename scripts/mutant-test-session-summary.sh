#!/usr/bin/env bash
# Mutant test for buildSessionSummary (FIX a)
#
# Mutants:
# M1: Skip exercises with no prior_progress (would drop first-session exercises)
# M2: Return progressNotes client state instead of DB query (the original bug)
# M3: Skip exercises where feel is null (would drop exercises with no feel rating)

set -euo pipefail

TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"; exit 130' INT TERM
trap 'CODE=$?; rm -rf "$TEMP"; exit $CODE' EXIT

SRC="src/lib/session/build-session-summary.ts"
BACKUP="$TEMP/build-session-summary.ts.bak"

cp "$SRC" "$BACKUP"

echo "Mutant tests for buildSessionSummary (FIX a)"
echo

# M1: Skip exercises with no prior_progress
echo "M1: Skip exercises with no prior_progress"
sed -i 's/if (ex.status === "skipped" || ex.sets.length === 0) continue;/if (ex.status === "skipped" || ex.sets.length === 0 || !ex.prior_progress) continue;/' "$SRC"

# Verify mutation
if ! grep -q "|| !ex.prior_progress" "$SRC"; then
  echo "  ✗ Mutation M1 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

# Run test - must fail
if npx tsx scripts/test-session-summary-from-db.ts >/dev/null 2>&1; then
  echo "  ✗ M1: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M1: Test failed as expected (mutant killed)"
fi

# Restore
cp "$BACKUP" "$SRC"

# M2: Return empty array instead of DB summary (simulating client state loss)
echo "M2: Return empty array (simulating lost client state)"
sed -i 's/return notes;/return [];/' "$SRC"

if ! grep -q "return \[\];" "$SRC"; then
  echo "  ✗ Mutation M2 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

if npx tsx scripts/test-session-summary-from-db.ts >/dev/null 2>&1; then
  echo "  ✗ M2: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M2: Test failed as expected (mutant killed)"
fi

cp "$BACKUP" "$SRC"

# M3: Filter out exercises where feel is null
echo "M3: Filter out exercises where feel is null"
sed -i '/for (const ex of exercises) {/a\  if (!ex.feel) continue;' "$SRC"

if ! grep -q "if (!ex.feel) continue;" "$SRC"; then
  echo "  ✗ Mutation M3 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

if npx tsx scripts/test-session-summary-from-db.ts >/dev/null 2>&1; then
  echo "  ✗ M3: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M3: Test failed as expected (mutant killed)"
fi

cp "$BACKUP" "$SRC"

echo
echo "✅ All 3 mutants killed"
