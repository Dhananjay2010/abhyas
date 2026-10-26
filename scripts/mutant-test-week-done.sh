#!/usr/bin/env bash
# Mutant test for computeCompletedDays (FIX b)
#
# Mutants:
# M1: Don't mark yoga/breathing as done (only strength)
# M2: Mark in_progress as done (missing status check)
# M3: Return empty set (no done marking at all)

set -euo pipefail

TEMP=$(mktemp -d)
trap 'CODE=$?; [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"; rm -rf "$TEMP"; exit $CODE' EXIT
trap '[ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"; rm -rf "$TEMP"; exit 130' INT TERM

SRC="src/lib/today/completed-days.ts"
BACKUP="$TEMP/completed-days.ts.bak"

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1

cp "$SRC" "$BACKUP"

echo "Mutant tests for computeCompletedDays (FIX b)"

# Baseline
npx tsx scripts/test-week-done.ts >/dev/null 2>&1 || { echo "✗ Baseline failed"; exit 1; }
echo "✓ Baseline passed"
echo

# M1
echo "M1: Only mark strength sessions"
sed -i 's/if (s.status === "completed") {/if (s.status === "completed" \&\& (s.actual_type === "weights" || s.actual_type === "bodyweight")) {/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
OUT=$(npx tsx scripts/test-week-done.ts 2>&1 || true)
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M1: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M1: Survived" && cp "$BACKUP" "$SRC" && exit 1
fi
cp "$BACKUP" "$SRC"

# M2
echo "M2: Mark in_progress"
sed -i 's/if (s.status === "completed") {/if (true) {/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M2: No change" && exit 1
OUT=$(npx tsx scripts/test-week-done.ts 2>&1 || true)
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M2: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M2: Survived" && cp "$BACKUP" "$SRC" && exit 1
fi
cp "$BACKUP" "$SRC"

# M3
echo "M3: Return empty"
sed -i 's/completed.add(s.local_date);/\/\/ completed.add(s.local_date);/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M3: No change" && exit 1
OUT=$(npx tsx scripts/test-week-done.ts 2>&1 || true)
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
