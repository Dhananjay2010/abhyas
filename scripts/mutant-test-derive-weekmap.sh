#!/bin/bash
# Mutant 4: deriveTodayView empties week map (returns empty map)
set -e

BACKUP=$(mktemp)
TARGET="src/lib/today/derive-today-view.ts"
cp "$TARGET" "$BACKUP"
trap "mv '$BACKUP' '$TARGET'" EXIT

# Mutate: return empty map
sed -i 's/chosenByDayIndex,$/chosenByDayIndex: new Map(),/' "$TARGET"

echo "=== Mutant 4: deriveTodayView empty week map ==="
npm run test:derive-today-view 2>&1 | grep -E "(✓|✗|passed|failed)" | tail -15
