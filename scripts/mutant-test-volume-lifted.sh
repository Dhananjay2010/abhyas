#!/usr/bin/env bash
# Mutant test for formatVolumeLifted (FIX d)

set -euo pipefail

TEMP=$(mktemp -d)
trap 'CODE=$?; [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"; rm -rf "$TEMP"; exit $CODE' EXIT
trap '[ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"; rm -rf "$TEMP"; exit 130' INT TERM

SRC="src/lib/session/format-volume-lifted.ts"
BACKUP="$TEMP/format-volume-lifted.ts.bak"

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1

cp "$SRC" "$BACKUP"

echo "Mutant tests for formatVolumeLifted (FIX d)"

npx tsx scripts/test-format-volume-lifted.ts >/dev/null 2>&1 || { echo "✗ Baseline failed"; exit 1; }
echo "✓ Baseline passed"
echo

echo "M1: Abbreviate with 't'"
sed -i '/Metric: round to nearest kg/a\    if (rounded >= 10000) return `${Math.round(rounded / 1000)}t`;' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1 || true)
echo "$OUT" | grep -q "✗" && echo "  ✓ M1: Killed" && echo "     $(echo "$OUT" | grep "✗" | head -1)" || { echo "  ✗ M1: Survived"; cp "$BACKUP" "$SRC"; exit 1; }
cp "$BACKUP" "$SRC"

echo "M2: No imperial conversion"
sed -i 's/const lb = kgToLb(volumeKg);/const lb = volumeKg; \/\/ Bug/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M2: No change" && exit 1
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1 || true)
echo "$OUT" | grep -q "✗" && echo "  ✓ M2: Killed" && echo "     $(echo "$OUT" | grep "✗" | head -1)" || { echo "  ✗ M2: Survived"; cp "$BACKUP" "$SRC"; exit 1; }
cp "$BACKUP" "$SRC"

echo "M3: No separators"
sed -i 's/const formatted = rounded.toLocaleString("en-US");/const formatted = String(rounded);/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M3: No change" && exit 1
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1 || true)
echo "$OUT" | grep -q "✗" && echo "  ✓ M3: Killed" && echo "     $(echo "$OUT" | grep "✗" | head -1)" || { echo "  ✗ M3: Survived"; cp "$BACKUP" "$SRC"; exit 1; }
cp "$BACKUP" "$SRC"

git diff --quiet "$SRC" || { echo "✗ Not restored"; exit 1; }
echo
echo "✅ All 3 mutants killed"
