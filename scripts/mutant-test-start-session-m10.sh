#!/usr/bin/env bash
set -euo pipefail

# Mutant M10: Remove the "no active training block" check
# Expected: test:start-session-m10-no-block fails

TARGET="src/lib/session/start-session-full-core.ts"
BACKUP=$(mktemp)

trap "mv '$BACKUP' '$TARGET'; echo 'RESTORED'" EXIT

cp "$TARGET" "$BACKUP"

# Mutate: Comment out the no-block check
# Original:
#   if (rolloverResult.status === "none") {
#     return { ok: false, error: "You have no active training block." };
#   }
# Mutant: skip this check

sed -i '/if (rolloverResult\.status === "none") {/,/^  }$/c\  \/\/ Mutant: no-block check removed' "$TARGET"

echo "MUTANT ACTIVE: No-block check removed"

if npm run test:start-session-m10-no-block 2>&1 | tee /tmp/mutant-m10.log; then
  echo "SURVIVED M10 (BAD: test should have failed)"
  exit 1
else
  echo "KILLED M10 (GOOD: test failed as expected)"
  exit 0
fi
