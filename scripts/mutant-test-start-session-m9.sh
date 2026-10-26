#!/usr/bin/env bash
set -euo pipefail

# Mutant M9: Use UTC date instead of local date for weekday calculation
# Expected: test:start-session-m9-weekday-and-timezone fails

TARGET="src/lib/session/start-session-full-core.ts"
BACKUP=$(mktemp)

trap "mv '$BACKUP' '$TARGET'; echo 'RESTORED'" EXIT

cp "$TARGET" "$BACKUP"

# Mutate: Change isoWeekday(today) to isoWeekday off by one
# Original: const dayIndex = isoWeekday(today);
# Mutant: const dayIndex = isoWeekday(today) % 7 + 1;
sed -i 's/const dayIndex = isoWeekday(today);/const dayIndex = isoWeekday(today) % 7 + 1;/g' "$TARGET"

echo "MUTANT ACTIVE: Weekday off by one"

if npm run test:start-session-m9-weekday-and-timezone 2>&1 | tee /tmp/mutant-m9.log; then
  echo "SURVIVED M9 (BAD: test should have failed)"
  exit 1
else
  echo "KILLED M9 (GOOD: test failed as expected)"
  exit 0
fi
