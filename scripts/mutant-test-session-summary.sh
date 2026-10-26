#!/usr/bin/env bash
# Mutant test for buildSessionSummary (FIX a)

set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/session/build-session-summary.ts"
BACKUP="$TEMP/build-session-summary.ts.bak"

cleanup() {
  CODE=$?
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$SRC"
  fi
  rm -rf "$TEMP"
  exit $CODE
}

trap cleanup EXIT INT TERM

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1
cp "$SRC" "$BACKUP"

echo "Mutant tests for buildSessionSummary (FIX a)"

if ! npx tsx scripts/test-session-summary-from-db.ts >/dev/null 2>&1; then
  echo "✗ Baseline failed"
  exit 1
fi
echo "✓ Baseline passed"
echo

# M1
echo "M1: Skip exercises with no prior_progress"
sed -i 's/if (ex.status === "skipped" || ex.sets.length === 0) continue;/if (ex.status === "skipped" || ex.sets.length === 0 || !ex.prior_progress) continue;/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M1: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M1: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M1: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

# M2
echo "M2: Return empty array"
sed -i 's/return notes;/return [];/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M2: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M2: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M2: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

# M3
echo "M3: Filter out null feel"
sed -i '/for (const ex of exercises) {/a\  if (!ex.feel) continue;' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M3: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M3: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M3: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

if ! git diff --quiet "$SRC"; then
  echo "✗ Not restored"
  exit 1
fi
echo
echo "✅ All 3 mutants killed"
