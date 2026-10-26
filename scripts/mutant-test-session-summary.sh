#!/usr/bin/env bash
set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/session/build-session-summary.ts"
BACKUP="$TEMP/build-session-summary.ts.bak"

cleanup() {
  [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"
  rm -rf "$TEMP"
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

# M1: Skip exercises with no prior_progress
echo "M1: Skip exercises with no prior_progress"
sed -i 's/if (ex.status === "skipped" || ex.sets.length === 0) continue;/if (ex.status === "skipped" || ex.sets.length === 0 || !ex.prior_progress) continue;/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1)
CODE=$?
set -e
if [ $CODE -eq 0 ]; then
  echo "  ✗ M1: Survived"
  exit 1
fi
echo "  ✓ M1: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

# M2: Return empty array
echo "M2: Return empty array"
sed -i 's/return notes;/return [];/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M2: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1)
CODE=$?
set -e
if [ $CODE -eq 0 ]; then
  echo "  ✗ M2: Survived"
  exit 1
fi
echo "  ✓ M2: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

# M3: Filter out null feel
echo "M3: Filter out null feel"
sed -i '/for (const ex of exercises) {/a\  if (!ex.feel) continue;' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M3: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-session-summary-from-db.ts 2>&1)
CODE=$?
set -e
if [ $CODE -eq 0 ]; then
  echo "  ✗ M3: Survived"
  exit 1
fi
echo "  ✓ M3: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

git diff --quiet "$SRC" || { echo "✗ Not restored"; exit 1; }
echo
echo "✅ All 3 mutants killed"
