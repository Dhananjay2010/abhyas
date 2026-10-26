#!/usr/bin/env bash
set -euo pipefail

# Mutant M11: Ignore stale-core error (returns ok with undefined sessionId)
# Expected: test:start-session-m11-stale-error fails

TARGET="src/lib/session/start-session-full-core.ts"
BACKUP=$(mktemp)

trap "mv '$BACKUP' '$TARGET'; echo 'RESTORED'" EXIT

cp "$TARGET" "$BACKUP"

# Mutate: Comment out the stale error check
# Original:
#   if (!staleResult.ok) {
#     return { ok: false, error: staleResult.error };
#   }
# Mutant: skip this check

sed -i '/if (!staleResult\.ok) {/,/^  }$/d' "$TARGET"

echo "MUTANT ACTIVE: Stale-core error check removed"

if npm run test:start-session-m11-stale-error 2>&1 | tee /tmp/mutant-m11.log; then
  echo "SURVIVED M11 (BAD: test should have failed)"
  exit 1
else
  echo "KILLED M11 (GOOD: test failed as expected)"
  exit 0
fi
