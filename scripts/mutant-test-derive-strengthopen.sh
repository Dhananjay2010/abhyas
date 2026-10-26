#!/bin/bash
# Mutant 2: deriveTodayView drops strengthOpen from promptDecision
set -e

BACKUP=$(mktemp)
TARGET="src/lib/today/derive-today-view.ts"
cp "$TARGET" "$BACKUP"
trap "mv '$BACKUP' '$TARGET'" EXIT

# Mutate: omit strengthOpen from decideTodayPrompts
sed -i 's/strengthOpen,$/\/\/ strengthOpen,/' "$TARGET"

echo "=== Mutant 2: deriveTodayView omits strengthOpen ==="
npm run test:derive-today-view 2>&1 | grep -E "(✓|✗|passed|failed|error)" | tail -20
