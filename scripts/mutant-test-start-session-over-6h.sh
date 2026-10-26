#!/usr/bin/env bash
set -euo pipefail

# Mutant: Make 6-hour threshold never trigger by setting it to a huge value
# Expected: test:start-session-over-6h fails because >6h session is resumed, not closed

TARGET="src/lib/session/close-stale.ts"
BACKUP=$(mktemp)

trap "mv '$BACKUP' '$TARGET'; echo 'RESTORED'" EXIT

cp "$TARGET" "$BACKUP"

# Mutate: Change 21600 (6 hours) to 999999999 (huge value that never triggers)
# Original: export const STALE_INACTIVITY_THRESHOLD_SECONDS = 21600;
# Mutant: export const STALE_INACTIVITY_THRESHOLD_SECONDS = 999999999;
sed -i 's/STALE_INACTIVITY_THRESHOLD_SECONDS = 21600;/STALE_INACTIVITY_THRESHOLD_SECONDS = 999999999;/g' "$TARGET"

echo "MUTANT ACTIVE: 6-hour threshold set to 999999999 (never triggers)"

if npm run test:start-session-over-6h 2>&1 | tee /tmp/mutant-over-6h.log; then
  echo "SURVIVED over-6h mutant (BAD: test should have failed)"
  exit 1
else
  echo "KILLED over-6h mutant (GOOD: test failed as expected)"
  exit 0
fi
