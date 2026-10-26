#!/usr/bin/env bash
set -euo pipefail

# Mutant M9: Use UTC date instead of local date for session date and weekday
# Expected: test:start-session-m9-weekday-and-timezone fails on IST midnight cases

TARGET="src/lib/session/start-session-full-core.ts"
BACKUP=$(mktemp)

trap "mv '$BACKUP' '$TARGET'; echo 'RESTORED'" EXIT

cp "$TARGET" "$BACKUP"

# Mutate: Change localDateString(timezone, new Date(nowMs)) to use UTC
# Original: const today = localDateString(timezone, new Date(nowMs));
# Mutant: const today = localDateString("UTC", new Date(nowMs));
sed -i 's/const today = localDateString(timezone, new Date(nowMs));/const today = localDateString("UTC", new Date(nowMs));/g' "$TARGET"

echo "MUTANT ACTIVE: Use UTC date instead of local timezone date"

if npm run test:start-session-m9-weekday-and-timezone 2>&1 | tee /tmp/mutant-m9.log; then
  echo "SURVIVED M9 (BAD: test should have failed)"
  exit 1
else
  echo "KILLED M9 (GOOD: test failed as expected)"
  exit 0
fi
