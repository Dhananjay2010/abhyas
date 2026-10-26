#!/usr/bin/env bash
set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/today/completed-days.ts"
BACKUP="$TEMP/completed-days.ts.bak"

cleanup() {
  [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"
  rm -rf "$TEMP"
}
trap cleanup EXIT INT TERM

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1
cp "$SRC" "$BACKUP"

echo "Mutant tests for computeCompletedDays (FIX b)"

if ! npx tsx scripts/test-week-done.ts >/dev/null 2>&1; then
  echo "✗ Baseline failed"
  exit 1
fi
echo "✓ Baseline passed"
echo

# M1: Only mark strength
echo "M1: Only mark strength sessions"
sed -i 's/if (s.status === "completed") {/if (s.status === "completed" \&\& (s.actual_type === "weights" || s.actual_type === "bodyweight")) {/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
OUT=$(npx tsx scripts/test-week-done.ts 2>&1) || true
echo "$OUT" | grep -q "✗" || { echo "  ✗ M1: Survived"; exit 1; }
echo "  ✓ M1: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

# M2: Mark in_progress
echo "M2: Mark in_progress"
sed -i 's/if (s.status === "completed") {/if (true) {/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M2: No change" && exit 1
OUT=$(npx tsx scripts/test-week-done.ts 2>&1) || true
echo "$OUT" | grep -q "✗" || { echo "  ✗ M2: Survived"; exit 1; }
echo "  ✓ M2: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

# M3: Return empty
echo "M3: Return empty"
sed -i 's/completed.add(s.local_date);/\/\/ completed.add(s.local_date);/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M3: No change" && exit 1
OUT=$(npx tsx scripts/test-week-done.ts 2>&1) || true
echo "$OUT" | grep -q "✗" || { echo "  ✗ M3: Survived"; exit 1; }
echo "  ✓ M3: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

git diff --quiet "$SRC" || { echo "✗ Not restored"; exit 1; }
echo
echo "✅ All 3 mutants killed"
