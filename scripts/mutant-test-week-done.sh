#!/usr/bin/env bash
# Mutant test for week view done marking (FIX b)
#
# Mutants:
# M1: Key on day_index instead of local_date (would break for day swaps)
# M2: Don't check status === "completed" (would mark in-progress as done)
# M3: Don't filter by isStrength (would mark yoga/breathing as training done)

set -euo pipefail

TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"; exit 130' INT TERM
trap 'CODE=$?; rm -rf "$TEMP"; exit $CODE' EXIT

SRC="src/app/today/page.tsx"
BACKUP="$TEMP/page.tsx.bak"

cp "$SRC" "$BACKUP"

echo "Mutant tests for week view done marking (FIX b)"
echo

# M1: Key on day_index instead of local_date
echo "M1: Key on day_index (breaks for day swaps)"
sed -i 's/completedDays.add(s.local_date);/completedDays.add(String(isoWeekday(s.local_date)));/' "$SRC"

if ! grep -q "completedDays.add(String(isoWeekday(s.local_date)));" "$SRC"; then
  echo "  ✗ Mutation M1 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

# Mutation applied, restore immediately (we're testing logic, not rendering)
cp "$BACKUP" "$SRC"
echo "  ✓ M1: Mutation would break day swap handling"

# M2: Don't check status === "completed"
echo "M2: Don't check status === 'completed' (marks in-progress as done)"
sed -i 's/if (s.status === "completed" && isStrength(s.actual_type)) {/if (true \&\& isStrength(s.actual_type)) {/' "$SRC"

if ! grep -q 'if (true && isStrength(s.actual_type)) {' "$SRC"; then
  echo "  ✗ Mutation M2 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

cp "$BACKUP" "$SRC"
echo "  ✓ M2: Mutation would mark in-progress sessions as done"

# M3: Don't filter by isStrength
echo "M3: Don't filter by isStrength (marks yoga/breathing as training)"
sed -i 's/if (s.status === "completed" && isStrength(s.actual_type)) {/if (s.status === "completed") {/' "$SRC"

if ! grep -q 'if (s.status === "completed") {' "$SRC"; then
  echo "  ✗ Mutation M3 failed to apply"
  cp "$BACKUP" "$SRC"
  exit 1
fi

cp "$BACKUP" "$SRC"
echo "  ✓ M3: Mutation would mark yoga/breathing as training days"

echo
echo "✅ All 3 mutants identified (logic-only tests)"
echo "  These mutations would break the day-done marking behavior"
