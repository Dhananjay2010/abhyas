#!/usr/bin/env bash
set -euo pipefail

# Mutant M1: Keep old started_at when restarting a skipped session
# Expected: test:start-session-m1-skipped-restart fails

TARGET="src/lib/session/start-session-full-core.ts"
BACKUP=$(mktemp)

trap "mv '$BACKUP' '$TARGET'; echo 'RESTORED'" EXIT

cp "$TARGET" "$BACKUP"

# Mutate: remove the started_at reset logic
# Original: ...(existing.started_at === null || existing.status === "skipped" ? { started_at: isoFromMs(nowMs) } : {}),
# Mutant: ...(existing.started_at === null ? { started_at: isoFromMs(nowMs) } : {}),
sed -i 's/existing\.started_at === null || existing\.status === "skipped"/existing.started_at === null/g' "$TARGET"

echo "MUTANT ACTIVE: Keep old started_at for skipped sessions"

if npm run test:start-session-m1-skipped-restart 2>&1 | tee /tmp/mutant-m1.log; then
  echo "SURVIVED M1 (BAD: test should have failed)"
  exit 1
else
  echo "KILLED M1 (GOOD: test failed as expected)"
  exit 0
fi
