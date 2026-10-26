#!/usr/bin/env bash
set -euo pipefail

TEMP=$(mktemp -d)
SRC="src/lib/session/format-volume-lifted.ts"
BACKUP="$TEMP/format-volume-lifted.ts.bak"

cleanup() {
  [ -f "$BACKUP" ] && cp "$BACKUP" "$SRC"
  rm -rf "$TEMP"
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
sed -i 's/return `\${formatted} kg`;/if (rounded >= 10000) return `\${Math.round(rounded \/ 1000)}t`; return `\${formatted} kg`;/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M1: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1)
CODE=$?
set -e
[ $CODE -eq 0 ] && echo "  ✗ M1: Survived" && exit 1
echo "  ✓ M1: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

# M2
echo "M2: No imperial conversion"
sed -i 's/const lb = kgToLb(volumeKg);/const lb = volumeKg;/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M2: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1)
CODE=$?
set -e
[ $CODE -eq 0 ] && echo "  ✗ M2: Survived" && exit 1
echo "  ✓ M2: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

# M3
echo "M3: No separators"
sed -i 's/const formatted = rounded.toLocaleString("en-US");/const formatted = String(rounded);/' "$SRC"
cmp -s "$SRC" "$BACKUP" && echo "  ✗ M3: No change" && exit 1
set +e
OUT=$(npx tsx scripts/test-format-volume-lifted.ts 2>&1)
CODE=$?
set -e
[ $CODE -eq 0 ] && echo "  ✗ M3: Survived" && exit 1
echo "  ✓ M3: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"
cp "$BACKUP" "$SRC"

git diff --quiet "$SRC" || { echo "✗ Not restored"; exit 1; }
echo
echo "✅ All 3 mutants killed"
