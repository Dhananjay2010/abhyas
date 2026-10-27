#!/bin/bash
# Mutant test: removing rollover call or defensive start date should fail tests

set -e

ACTIONS_FILE="src/app/today/actions.ts"
STREAKS_FILE="src/lib/progress/streaks.ts"
PROGRESS_FILE="src/app/progress/page.tsx"
TMP=$(mktemp -d)
BACKUP_ACTIONS="$TMP/actions.ts"
BACKUP_STREAKS="$TMP/streaks.ts"
BACKUP_PROGRESS="$TMP/page.tsx"

echo "Mutant test: rebuild rollover and progress defensive fixes"
echo "============================================================"
echo ""

# Backup originals
cp "$ACTIONS_FILE" "$BACKUP_ACTIONS"
cp "$STREAKS_FILE" "$BACKUP_STREAKS"
cp "$PROGRESS_FILE" "$BACKUP_PROGRESS"

cleanup() {
  if [ "${cleanup_done:-0}" = "1" ]; then
    return
  fi
  cleanup_done=1
  echo "Restoring original files..."
  cp "$BACKUP_ACTIONS" "$ACTIONS_FILE"
  cp "$BACKUP_STREAKS" "$STREAKS_FILE"
  cp "$BACKUP_PROGRESS" "$PROGRESS_FILE"
  rm -rf "$TMP"
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

# Mutant 1: Remove the ensureCurrentBlock call from buildPlan
echo "Mutant 1: Remove ensureCurrentBlock call from buildPlan"
echo "Expected: test-rebuild-rollover-progress.ts should fail"
echo ""

# Remove the entire rollover section from buildPlan
sed -i '/Fix pd-b: Run rollover BEFORE rebuild/,/if (rollover.status === "error")/d' "$ACTIONS_FILE"

if npx tsx scripts/test-rebuild-rollover-progress.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 1 survived (test passes without ensureCurrentBlock)"
  exit 1
else
  echo "✓ Mutant 1 killed (test fails without ensureCurrentBlock)"
fi

# Restore for next mutant
cp "$BACKUP_ACTIONS" "$ACTIONS_FILE"

# Mutant 2: Remove the effectiveStart logic from Progress page
echo ""
echo "Mutant 2: Remove effectiveStart calculation (revert to firstBlockDate only)"
echo "Expected: test-rebuild-rollover-progress.ts should fail"
echo ""

# Replace the effectiveStart calculation with just firstBlockDate
sed -i '/Fix pd-b: Start from the EARLIER/,/effectiveStart,$/c\
  const dayRecords = buildDayRecords({\
    programs,\
    dayTypesByProgram,\
    completedSessions,\
    today,' "$PROGRESS_FILE"

if npx tsx scripts/test-rebuild-rollover-progress.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 2 survived (test passes without effectiveStart)"
  exit 1
else
  echo "✓ Mutant 2 killed (test fails without effectiveStart)"
fi

# Restore for next mutant
cp "$BACKUP_PROGRESS" "$PROGRESS_FILE"

# Mutant 3: Remove the effectiveStart parameter from buildDayRecords
echo ""
echo "Mutant 3: Remove effectiveStart parameter from buildDayRecords signature"
echo "Expected: test-rebuild-rollover-progress.ts should fail (type error or wrong behavior)"
echo ""

# Remove effectiveStart from function signature and revert to old logic
sed -i '/Fix pd-b: Optional override for the start date/d' "$STREAKS_FILE"
sed -i 's/effectiveStart?: string | null;//' "$STREAKS_FILE"
sed -i 's/const { programs, dayTypesByProgram, completedSessions, today, effectiveStart } = input;/const { programs, dayTypesByProgram, completedSessions, today } = input;/' "$STREAKS_FILE"
sed -i 's/const first = effectiveStart ?? firstBlockStart;/const first = firstBlockStart;/' "$STREAKS_FILE"

if npx tsx scripts/test-rebuild-rollover-progress.ts > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 3 survived (test passes without effectiveStart parameter)"
  exit 1
else
  echo "✓ Mutant 3 killed (test fails without effectiveStart parameter)"
fi

# Restore
cp "$BACKUP_STREAKS" "$STREAKS_FILE"

echo ""
echo "============================================================"
echo "✓ All mutants killed"
echo ""

cleanup_done=1
cp "$BACKUP_ACTIONS" "$ACTIONS_FILE"
cp "$BACKUP_STREAKS" "$STREAKS_FILE"
cp "$BACKUP_PROGRESS" "$PROGRESS_FILE"
rm -rf "$TMP"

exit 0
