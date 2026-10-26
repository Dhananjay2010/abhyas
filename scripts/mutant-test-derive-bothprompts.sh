#!/bin/bash
# Mutant 5: deriveTodayView returns both prompts (ignores priority logic)
set -e

BACKUP=$(mktemp)
TARGET="src/lib/today/decide-today-prompts.ts"
cp "$TARGET" "$BACKUP"
trap "mv '$BACKUP' '$TARGET'" EXIT

# Mutate: remove the mutual exclusion, always show rest-day-swap if conditions met
sed -i 's/&& !shouldAskMissedYesterday//' "$TARGET"

echo "=== Mutant 5: decideTodayPrompts shows both prompts ==="
npm run test:derive-today-view 2>&1 | grep -E "(✓|✗|passed|failed)" | tail -15
