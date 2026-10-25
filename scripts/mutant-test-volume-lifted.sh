#!/usr/bin/env bash
# Mutant test for formatVolumeLifted (FIX d)
#
# Mutants:
# M1: Abbreviate with 't' for large numbers (the original bug)
# M2: Don't convert to imperial units
# M3: Don't add thousands separators

set -euo pipefail

TEMP=$(mktemp -d)
trap 'CODE=$?; cp "$BACKUP" "$SRC" 2>/dev/null || true; rm -rf "$TEMP"; exit $CODE' EXIT
trap 'cp "$BACKUP" "$SRC" 2>/dev/null || true; rm -rf "$TEMP"; exit 130' INT TERM

SRC="src/lib/session/format-volume-lifted.ts"
BACKUP="$TEMP/format-volume-lifted.ts.bak"

if [ ! -f "$SRC" ]; then
  echo "✗ Source file $SRC not found"
  exit 1
fi

cp "$SRC" "$BACKUP"

echo "Mutant tests for formatVolumeLifted (FIX d)"
echo

# M1: Abbreviate with 't' for large numbers
echo "M1: Abbreviate with 't' for values >= 10000"
sed -i '/Metric: round to nearest kg/a\    if (rounded >= 10000) return `${Math.round(rounded / 1000)}t`;' "$SRC"

if ! cmp -s "$SRC" "$BACKUP"; then
  if npx tsx scripts/test-format-volume-lifted.ts >/dev/null 2>&1; then
    echo "  ✗ M1: Test passed but should have failed (mutant survived)"
    cp "$BACKUP" "$SRC"
    exit 1
  else
    echo "  ✓ M1: Test failed as expected (mutant killed)"
  fi
else
  echo "  ✗ M1: Mutation failed to apply"
  exit 1
fi

cp "$BACKUP" "$SRC"

# M2: Don't convert to imperial
echo "M2: Don't convert to imperial units"
sed -i 's/const lb = kgToLb(volumeKg);/const lb = volumeKg; \/\/ Bug: no conversion/' "$SRC"

if ! cmp -s "$SRC" "$BACKUP"; then
  if npx tsx scripts/test-format-volume-lifted.ts >/dev/null 2>&1; then
    echo "  ✗ M2: Test passed but should have failed (mutant survived)"
    cp "$BACKUP" "$SRC"
    exit 1
  else
    echo "  ✓ M2: Test failed as expected (mutant killed)"
  fi
else
  echo "  ✗ M2: Mutation failed to apply"
  exit 1
fi

cp "$BACKUP" "$SRC"

# M3: Don't add thousands separators
echo "M3: Don't add thousands separators"
sed -i 's/const formatted = rounded.toLocaleString("en-US");/const formatted = String(rounded);/' "$SRC"

if ! cmp -s "$SRC" "$BACKUP"; then
  if npx tsx scripts/test-format-volume-lifted.ts >/dev/null 2>&1; then
    echo "  ✗ M3: Test passed but should have failed (mutant survived)"
    cp "$BACKUP" "$SRC"
    exit 1
  else
    echo "  ✓ M3: Test failed as expected (mutant killed)"
  fi
else
  echo "  ✗ M3: Mutation failed to apply"
  exit 1
fi

cp "$BACKUP" "$SRC"

# Final check: source must be unmodified
if ! git diff --quiet "$SRC"; then
  echo "  ✗ Source file was not properly restored"
  exit 1
fi

echo
echo "✅ All 3 mutants killed, source restored"
