#!/usr/bin/env bash
set -euo pipefail

echo "=== Units Reader Mutant Test ==="
echo

BACKUP="/tmp/read-profile-units-backup-$$.ts"
TARGET="src/lib/program/read-profile-units-or-null.ts"

# Back up original
cp "$TARGET" "$BACKUP"

restore() {
  cp "$BACKUP" "$TARGET"
  rm -f "$BACKUP"
}

trap restore EXIT

echo "Testing baseline..."
if ! npm run test:profile-units-fallback > /tmp/units-baseline.log 2>&1; then
  echo "❌ Baseline failed"
  cat /tmp/units-baseline.log
  exit 1
fi
echo "✅ Baseline passed"

echo
echo "Applying mutant: return 'metric' on error instead of null"
sed -i 's/return null;/return "metric";/g' "$TARGET"

echo "Testing mutant..."
if npm run test:profile-units-fallback > /tmp/units-mutant.log 2>&1; then
  echo "❌ MUTANT SURVIVED"
  exit 1
fi

# Check for expected failure
if grep -q "FAIL Error case returns null" /tmp/units-mutant.log && \
   grep -q "FAIL Null profile returns null" /tmp/units-mutant.log; then
  echo "✅ KILLED by named assertions:"
  grep "FAIL Error case returns null" /tmp/units-mutant.log | head -1
  grep "FAIL Null profile returns null" /tmp/units-mutant.log | head -1
  exit 0
else
  echo "❌ Mutant failed but without expected assertions"
  cat /tmp/units-mutant.log
  exit 1
fi
