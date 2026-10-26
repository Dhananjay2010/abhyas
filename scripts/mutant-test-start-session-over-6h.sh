#!/usr/bin/env bash
set -euo pipefail

# Mutant: Check for existing in_progress AFTER stale-close (wrong order)
# This would make >6h sessions be checked/resumed before being closed
# Expected: test:start-session-over-6h fails

TARGET="src/lib/session/start-session-full-core.ts"
BACKUP=$(mktemp)

trap "mv '$BACKUP' '$TARGET'; echo 'RESTORED'" EXIT

cp "$TARGET" "$BACKUP"

# Mutate: Move the "Case C: Idempotent" check to AFTER the stale-close check
# This breaks the >6h closing logic because we'd return the stale session before closing it

# Find the idempotent section (lines 157-161) and stale section (lines 163-168)
# We'll just delete the idempotent check entirely, which will cause it to always go through stale-close
# then insert, which should make the first test fail differently

# Actually, let's do something simpler: just always return the stale session without closing
sed -i '/\/\/ L3: Close stale sessions/,/^  }$/d' "$TARGET"

echo "MUTANT ACTIVE: Stale-close logic removed"

if npm run test:start-session-over-6h 2>&1 | tee /tmp/mutant-over-6h.log; then
  echo "SURVIVED over-6h mutant (BAD: test should have failed)"
  exit 1
else
  echo "KILLED over-6h mutant (GOOD: test failed as expected)"
  exit 0
fi
