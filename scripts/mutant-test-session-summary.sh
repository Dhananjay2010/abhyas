#!/usr/bin/env bash
# Mutant test for buildSessionSummary (FIX a)
#
# Mutants:
# M1: Skip exercises with no prior_progress
# M2: Return empty array (simulating lost client state)
# M3: Filter out exercises where feel is null

set -euo pipefail

TEMP=$(mktemp -d)
trap 'CODE=$?; [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"; rm -rf "$TEMP"; exit $CODE' EXIT
trap '[ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"; rm -rf "$TEMP"; exit 130' INT TERM

SRC="src/lib/session/build-session-summary.ts"
BACKUP="$TEMP/build-session-summary.ts.bak"

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1

cp "$SRC" "$BACKUP"

echo "Mutant tests for buildSessionSummary (FIX a)"

# Baseline
npx tsx scripts/test-session-summary-from-db.ts >/dev/null 2>&1 || { echo "✗ Baseline failed"; exit 1; }
echo "✓ Baseline passed"
echo

# M1
echo "M1: Skip exercises with no prior_progress"
sed -i 's/if (ex.status === "skipped" || ex.sets.length === 0) continue;/if (ex.status === "skipped" || ex.sets.length === 0 || !ex.prior_progress) continue;/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1 || true)
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M1: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M1: Survived" && cp "$BACKUP" "$SRC" && exit 1
fi
cp "$BACKUP" "$SRC"

# M2
echo "M2: Return empty array"
sed -i 's/return notes;/return [];/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M2: No change" && exit 1
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1 || true)
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M2: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M2: Survived" && cp "$BACKUP" "$SRC" && exit 1
fi
cp "$BACKUP" "$SRC"

# M3
echo "M3: Filter out null feel"
sed -i '/for (const ex of exercises) {/a\  if (!ex.feel) continue;' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M3: No change" && exit 1
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1 || true)
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M3: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M3: Survived" && cp "$BACKUP" "$SRC" && exit 1
fi
cp "$BACKUP" "$SRC"

git diff --quiet "$SRC" || { echo "✗ Not restored"; exit 1; }
echo
echo "✅ All 3 mutants killed"
