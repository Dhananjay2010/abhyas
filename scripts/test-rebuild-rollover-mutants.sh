#!/bin/bash
# Mutant test: removing rollover call or defensive start date should fail tests

set -e

# Check that we're in a real-DB test environment
if [ "$REAL_DB" != "1" ] && [ -z "$CI" ]; then
  echo "⏭️  Skipping mutant tests (not in DB test environment)"
  echo "   Set REAL_DB=1 to run these tests"
  exit 0
fi

# Check DATABASE_URL early - test script needs it
if [ -z "$DATABASE_URL" ]; then
  echo "❌ FAIL: DATABASE_URL not set (mutants would incorrectly pass/fail)"
  exit 1
fi

ACTIONS_FILE="src/app/today/actions.ts"
REBUILD_CORE="src/lib/program/rebuild-plan-core.ts"
PROGRESS_START_FILE="src/lib/progress/progress-start-date.ts"
STREAKS_FILE="src/lib/progress/streaks.ts"
TMP=$(mktemp -d)
BACKUP_ACTIONS="$TMP/actions.ts"
BACKUP_CORE="$TMP/rebuild-plan-core.ts"
BACKUP_PROGRESS_START="$TMP/progress-start-date.ts"
BACKUP_STREAKS="$TMP/streaks.ts"

echo "Mutant test: rebuild rollover and progress defensive fixes"
echo "============================================================"
echo ""

# Backup originals
cp "$ACTIONS_FILE" "$BACKUP_ACTIONS"
cp "$REBUILD_CORE" "$BACKUP_CORE"
cp "$PROGRESS_START_FILE" "$BACKUP_PROGRESS_START"
cp "$STREAKS_FILE" "$BACKUP_STREAKS"

cleanup() {
  if [ "${cleanup_done:-0}" = "1" ]; then
    return
  fi
  cleanup_done=1
  echo "Restoring original files..."
  cp "$BACKUP_ACTIONS" "$ACTIONS_FILE"
  cp "$BACKUP_CORE" "$REBUILD_CORE"
  cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
  cp "$BACKUP_STREAKS" "$STREAKS_FILE"
  rm -rf "$TMP"
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

# Mutant 1: Remove the ensureCurrentBlock call from rebuild core
echo "Mutant 1: Remove ensureCurrentBlock call from rebuild-plan-core"
echo "Expected: test-rebuild-rollover-progress-real-db.ts should fail"
echo ""

# Remove the rollover section from rebuildPlanCore
cp "$BACKUP_CORE" "$REBUILD_CORE"
sed -i '/const activeBlock = await deps.fetchActiveBlock/,/}/d' "$REBUILD_CORE"

# Verify the mutation applied
if diff -q "$BACKUP_CORE" "$REBUILD_CORE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 1 did not apply (files are identical)"
  exit 1
fi

REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > /tmp/mutant1.log 2>&1
if [ $? -eq 0 ]; then
  echo "✗ FAIL: Mutant 1 survived (test passes without ensureCurrentBlock)"
  cat /tmp/mutant1.log
  exit 1
else
  # Check that test actually ran (not skipped)
  if grep -q "⏭️.*Skipping" /tmp/mutant1.log; then
    echo "✗ FAIL: Mutant test was skipped, not actually run"
    cat /tmp/mutant1.log
    exit 1
  fi
  echo "✓ Mutant 1 killed (test fails without ensureCurrentBlock)"
fi

# Restore for next mutant
cp "$BACKUP_CORE" "$REBUILD_CORE"

# Mutant 2: Revert progressStartDate to just first block date
echo ""
echo "Mutant 2: Revert progressStartDate to only use first block date"
echo "Expected: test-rebuild-rollover-progress-real-db.ts should fail"
echo ""

cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
# Replace the entire function body to just return firstBlockDate
cat > "$PROGRESS_START_FILE" << 'EOF'
export function progressStartDate(input: {
  programs: Array<{ startedOn: string }>;
  completedSessions: Array<{ local_date: string }>;
}): string | null {
  const { programs } = input;
  return programs.length > 0 ? programs[0].startedOn : null;
}
EOF

# Verify the mutation applied
if diff -q "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 2 did not apply (files are identical)"
  exit 1
fi

REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > /tmp/mutant2.log 2>&1
if [ $? -eq 0 ]; then
  echo "✗ FAIL: Mutant 2 survived (test passes with only first block date)"
  cat /tmp/mutant2.log
  exit 1
else
  if grep -q "⏭️.*Skipping" /tmp/mutant2.log; then
    echo "✗ FAIL: Mutant test was skipped, not actually run"
    cat /tmp/mutant2.log
    exit 1
  fi
  echo "✓ Mutant 2 killed (test fails without session date consideration)"
fi

# Restore for next mutant
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"

# Mutant 3: Revert buildDayRecords min() logic to ?? fallback
echo ""
echo "Mutant 3: Revert buildDayRecords to use ?? instead of min()"
echo "Expected: test-rebuild-rollover-progress-real-db.ts should fail"
echo ""

cp "$BACKUP_STREAKS" "$STREAKS_FILE"
# Replace the min logic with just ?? fallback
sed -i '/Fix pd-b: Use the EARLIER of effectiveStart/,/first = effectiveStart ?? firstBlockStart;/c\
  const first = effectiveStart ?? firstBlockStart;' "$STREAKS_FILE"

# Verify the mutation applied  
if diff -q "$BACKUP_STREAKS" "$STREAKS_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 3 did not apply (files are identical)"
  exit 1
fi

REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > /tmp/mutant3.log 2>&1
if [ $? -eq 0 ]; then
  echo "✗ FAIL: Mutant 3 survived (test passes with ?? fallback)"
  cat /tmp/mutant3.log
  exit 1
else
  if grep -q "⏭️.*Skipping" /tmp/mutant3.log; then
    echo "✗ FAIL: Mutant test was skipped, not actually run"
    cat /tmp/mutant3.log
    exit 1
  fi
  echo "✓ Mutant 3 killed (test fails without min() logic)"
fi

# Restore
cp "$BACKUP_STREAKS" "$STREAKS_FILE"

echo ""
echo "============================================================"
echo "✓ All mutants killed"
echo ""

cleanup_done=1
cp "$BACKUP_ACTIONS" "$ACTIONS_FILE"
cp "$BACKUP_CORE" "$REBUILD_CORE"
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
cp "$BACKUP_STREAKS" "$STREAKS_FILE"
rm -rf "$TMP"

exit 0
