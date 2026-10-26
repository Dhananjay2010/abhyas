#!/usr/bin/env bash
# Mutant test for computeCompletedDays (FIX b)

set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/today/completed-days.ts"
BACKUP="$TEMP/completed-days.ts.bak"

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

echo "Mutant tests for computeCompletedDays (FIX b)"

if ! npx tsx scripts/test-week-done.ts >/dev/null 2>&1; then
  echo "✗ Baseline failed"
  exit 1
fi
echo "✓ Baseline passed"
echo

# M1
echo "M1: Only mark strength sessions"
sed -i 's/if (s.status === "completed") {/if (s.status === "completed" \&\& (s.actual_type === "weights" || s.actual_type === "bodyweight")) {/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M1: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-week-done.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M1: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M1: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

# M2
echo "M2: Mark in_progress"
sed -i 's/if (s.status === "completed") {/if (true) {/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M2: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-week-done.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M2: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M2: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

# M3
echo "M3: Return empty"
sed -i 's/completed.add(s.local_date);/\/\/ completed.add(s.local_date);/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M3: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-week-done.ts 2>&1) || true
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
