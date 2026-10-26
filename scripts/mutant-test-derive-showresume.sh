#!/bin/bash
# Mutant 3: deriveTodayView hides Resume button (showResume always false)
set -e

BACKUP=$(mktemp)
TARGET="src/lib/today/derive-today-view.ts"
cp "$TARGET" "$BACKUP"
trap "mv '$BACKUP' '$TARGET'" EXIT

# Mutate: showResume always false
sed -i 's/showResume: resumeDecision.showResume,$/showResume: false,/' "$TARGET"

echo "=== Mutant 3: deriveTodayView showResume always false ==="
npm run test:derive-today-view 2>&1 | grep -E "(✓|✗|passed|failed)" | tail -15
