#!/usr/bin/env bash
# Mutant test for formatVolumeLifted (FIX d)

set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/session/format-volume-lifted.ts"
BACKUP="$TEMP/format-volume-lifted.ts.bak"

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

echo "Mutant tests for formatVolumeLifted (FIX d)"

if ! npx tsx scripts/test-format-volume-lifted.ts >/dev/null 2>&1; then
  echo "✗ Baseline failed"
  exit 1
fi
echo "✓ Baseline passed"
echo

# M1
echo "M1: Abbreviate with t"
sed -i '/Metric: round to nearest kg/a\    if (rounded >= 10000) return \`$\{Math.round(rounded / 1000)\}t\`;' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M1: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M1: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M1: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

# M2
echo "M2: No imperial conversion"
sed -i 's/const lb = kgToLb(volumeKg);/const lb = volumeKg;/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M2: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1) || true
if echo "$OUT" | grep -q "✗"; then
  echo "  ✓ M2: Killed"
  echo "     $(echo "$OUT" | grep "✗" | head -1)"
else
  echo "  ✗ M2: Survived"
  exit 1
fi
cp "$BACKUP" "$SRC"

# M3
echo "M3: No separators"
sed -i 's/const formatted = rounded.toLocaleString("en-US");/const formatted = String(rounded);/' "$SRC"
if cmp -s "$SRC" "$BACKUP"; then
  echo "  ✗ M3: No change"
  exit 1
fi
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1) || true
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
