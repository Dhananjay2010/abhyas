#!/usr/bin/env bash
set -euo pipefail

echo "=== Unit-Neutral Message Mutant Test ==="
echo

BACKUP="/tmp/progression-backup-$$.ts"
TARGET="src/lib/program/progression.ts"

# Back up original
cp "$TARGET" "$BACKUP"

restore() {
  cp "$BACKUP" "$TARGET"
  rm -f "$BACKUP"
}

trap restore EXIT

echo "Testing baseline..."
if ! npm run test:profile-units-fallback > /tmp/neutral-baseline.log 2>&1; then
  echo "❌ Baseline failed"
  cat /tmp/neutral-baseline.log
  exit 1
fi
echo "✅ Baseline passed"

echo
echo "Applying mutant: disable unit-neutral path (displayWeight always returns weight)"
# Change the displayWeight function to never return null
sed -i 's/unit === null/false/g' "$TARGET"

echo "Testing mutant..."
if npm run test:profile-units-fallback > /tmp/neutral-mutant.log 2>&1; then
  echo "❌ MUTANT SURVIVED"
  exit 1
fi

# Check for expected failures in unit-neutral tests
if grep -q "FAIL Progressed (easy): no 'kg'" /tmp/neutral-mutant.log && \
   grep -q "FAIL Barbell counter 1: no 'kg'" /tmp/neutral-mutant.log; then
  echo "✅ KILLED by named assertions:"
  grep "FAIL Progressed (easy): no 'kg'" /tmp/neutral-mutant.log | head -1
  grep "FAIL Barbell counter 1: no 'kg'" /tmp/neutral-mutant.log | head -1
  exit 0
else
  echo "❌ Mutant failed but without expected assertions"
  tail -20 /tmp/neutral-mutant.log
  exit 1
fi
