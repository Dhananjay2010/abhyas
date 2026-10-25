#!/usr/bin/env bash
# Mutant test for formatVolumeLifted (FIX d)
#
# Mutants:
# M1: Abbreviate with 't' for large numbers (the original bug)
# M2: Don't convert to imperial units
# M3: Don't add thousands separators

set -euo pipefail

TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"; exit 130' INT TERM
trap 'CODE=$?; rm -rf "$TEMP"; exit $CODE' EXIT

SRC="src/lib/session/format-volume-lifted.ts"
BACKUP="$TEMP/format-volume-lifted.ts.bak"

cp "$SRC" "$BACKUP"

echo "Mutant tests for formatVolumeLifted (FIX d)"
echo

# M1: Abbreviate with 't' for large numbers
echo "M1: Abbreviate with 't' for values >= 10000"
# Add the abbreviation check in the metric section (after rounding, before formatting)
sed -i '/# Metric: round to nearest kg/,/const formatted = rounded.toLocaleString/ {
  /const rounded = Math.round(volumeKg);/a\  if (rounded >= 10000) return `${Math.round(rounded / 1000)}t`;
}' "$SRC"

if ! grep -q "return \`\${Math.round(rounded / 1000)}t\`;" "$SRC"; then
  echo "  ✗ Mutation M1 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

if npx tsx scripts/test-format-volume-lifted.ts >/dev/null 2>&1; then
  echo "  ✗ M1: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M1: Test failed as expected (mutant killed)"
fi

cp "$BACKUP" "$SRC"

# M2: Don't convert to imperial
echo "M2: Don't convert to imperial units"
sed -i 's/const lb = kgToLb(volumeKg);/const lb = volumeKg; \/\/ Bug: no conversion/' "$SRC"

if ! grep -q "const lb = volumeKg; \/\/ Bug: no conversion" "$SRC"; then
  echo "  ✗ Mutation M2 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

if npx tsx scripts/test-format-volume-lifted.ts >/dev/null 2>&1; then
  echo "  ✗ M2: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M2: Test failed as expected (mutant killed)"
fi

cp "$BACKUP" "$SRC"

# M3: Don't add thousands separators
echo "M3: Don't add thousands separators"
sed -i 's/const formatted = rounded.toLocaleString("en-US");/const formatted = String(rounded);/' "$SRC"

if ! grep -q "const formatted = String(rounded);" "$SRC"; then
  echo "  ✗ Mutation M3 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

if npx tsx scripts/test-format-volume-lifted.ts >/dev/null 2>&1; then
  echo "  ✗ M3: Test passed but should have failed (mutant not killed)"
  cp "$BACKUP" "$SRC"
  exit 1
else
  echo "  ✓ M3: Test failed as expected (mutant killed)"
fi

cp "$BACKUP" "$SRC"

echo
echo "✅ All 3 mutants killed"
