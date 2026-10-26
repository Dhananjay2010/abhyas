#!/bin/bash
# Mutant: planDayCore keep deletes non-rest overrides
# This mutant makes keep delete non-rest planned sessions (the old tautological behavior)

set -e

BACKUP=$(mktemp)
TARGET="src/lib/session/plan-day-core.ts"
cp "$TARGET" "$BACKUP"

trap "mv '$BACKUP' '$TARGET'" EXIT

# Mutate: keep deletes planned sessions
sed -i 's/if (plan.kind === "keep") {$/if (plan.kind === "keep") {\n    if (plannedSessions.length > 0) {\n      const { error: deleteError } = await client.deleteFrom(plannedSessions);\n      if (deleteError) return { ok: false, error: "Failed to delete." };\n    }/' "$TARGET"

echo "=== Mutant: keep deletes non-rest overrides ==="
npm run test:plan-day-core 2>&1 | grep -E "(✓|✗|passed|failed)" | tail -15
