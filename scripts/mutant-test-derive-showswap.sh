#!/bin/bash
# Mutant 1: deriveTodayView ignores showSwap (always true)
set -e

BACKUP=$(mktemp)
TARGET="src/lib/today/derive-today-view.ts"
cp "$TARGET" "$BACKUP"
trap "mv '$BACKUP' '$TARGET'" EXIT

# Mutate: showSwap always true
sed -i 's/showSwap: resumeDecision.showSwap,$/showSwap: true,/' "$TARGET"

echo "=== Mutant 1: deriveTodayView showSwap always true ==="
npm run test:derive-today-view 2>&1 | grep -E "(✓|✗|passed|failed)" | tail -15
