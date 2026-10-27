#!/bin/bash
# Mutant test: removing rollover call or defensive start date should fail tests

set -e

# Skip whenever REAL_DB != 1 (regardless of CI)
# The database-seed-test CI step always sets REAL_DB=1
if [ "$REAL_DB" != "1" ]; then
  echo "⏭️  Skipping mutant tests (REAL_DB=1 not set)"
  echo "   These tests require a real database (run in database-seed-test CI job)"
  exit 0
fi

# Source guard and check
source "$(dirname "$0")/lib-db-reset-guard.sh"
if ! check_db_reset_guard_bash check "supabase/config.toml"; then
  echo "❌ DB reset guard check failed:"
  check_db_reset_guard_bash explain "supabase/config.toml"
  exit 1
fi

# Check SUPABASE_SERVICE_ROLE_KEY early - test script needs it
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ FAIL: SUPABASE_SERVICE_ROLE_KEY not set (mutants would falsely appear killed)"
  exit 1
fi

REBUILD_CORE="src/lib/program/rebuild-plan-core.ts"
PROGRESS_START_FILE="src/lib/progress/progress-start-date.ts"
STREAKS_FILE="src/lib/progress/streaks.ts"
ROLLOVER_FILE="src/lib/program/rollover.ts"
TMP=$(mktemp -d)
BACKUP_CORE="$TMP/rebuild-plan-core.ts"
BACKUP_PROGRESS_START="$TMP/progress-start-date.ts"
BACKUP_STREAKS="$TMP/streaks.ts"
BACKUP_ROLLOVER="$TMP/rollover.ts"

echo "Mutant test: rebuild rollover and progress defensive fixes"
echo "============================================================"
echo ""

# Backup originals
cp "$REBUILD_CORE" "$BACKUP_CORE"
cp "$PROGRESS_START_FILE" "$BACKUP_PROGRESS_START"
cp "$STREAKS_FILE" "$BACKUP_STREAKS"
cp "$ROLLOVER_FILE" "$BACKUP_ROLLOVER"

cleanup() {
  if [ "${cleanup_done:-0}" = "1" ]; then
    return
  fi
  cleanup_done=1
  echo "Restoring original files..."
  cp "$BACKUP_CORE" "$REBUILD_CORE"
  cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
  cp "$BACKUP_STREAKS" "$STREAKS_FILE"
  cp "$BACKUP_ROLLOVER" "$ROLLOVER_FILE"
  rm -rf "$TMP"
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

# Baseline: Run unmutated tests first to ensure DB is working
echo "Baseline: Running unmutated tests to verify database is accessible"
echo ""

if REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > /tmp/baseline.log 2>&1; then
  echo "✓ Baseline test passed (database is accessible and test works)"
else
  echo "❌ FAIL: Baseline test failed (database may be down or test has a bug)"
  cat /tmp/baseline.log
  exit 1
fi

echo ""

KILLED=0
SURVIVED=0

# Mutant 1: Stub ensureCurrentBlock to return "none" (skip rollover)
echo "Mutant 1: Stub ensureCurrentBlock to return none (skip rollover)"
echo "Expected: test-rebuild-rollover-progress-real-db.ts should fail"
echo ""

cp "$BACKUP_CORE" "$REBUILD_CORE"
# Replace the ensureCurrentBlock call and comment out the error check
sed -i 's/const rollover = await deps\.ensureCurrentBlock(activeBlock);/const rollover = { status: "none" as const }; \/\/ await deps.ensureCurrentBlock(activeBlock);/' "$REBUILD_CORE"
sed -i '/if (rollover.status === "error") {/,/^  }$/s/^/\/\/ /' "$REBUILD_CORE"

# Verify the mutation applied
if ! grep -q 'const rollover = { status: "none" as const }; // await deps.ensureCurrentBlock' "$REBUILD_CORE"; then
  echo "✗ FAIL: Mutant 1 did not apply (replacement not found)"
  exit 1
fi

MUTANT1_LOG=$(mktemp)
if REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > "$MUTANT1_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 1 (test passes without rollover)"
  cat "$MUTANT1_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  # Check that test actually ran (not skipped)
  if grep -q "⏭️.*Skipping" "$MUTANT1_LOG"; then
    echo "✗ FAIL: Mutant test was skipped, not actually run"
    cat "$MUTANT1_LOG"
    exit 1
  fi
  # Check that an assertion killed it
  if ! grep -q "❌ FAIL" "$MUTANT1_LOG"; then
    echo "✗ FAIL: Mutant 1 killed by crash, not assertion"
    cat "$MUTANT1_LOG"
    exit 1
  fi
  echo "✓ Mutant 1 killed (test fails without rollover)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT1_LOG"

# Restore for next mutant
cp "$BACKUP_CORE" "$REBUILD_CORE"

# Mutant 2: Revert progressStartDate to just first block date
echo ""
echo "Mutant 2: Revert progressStartDate to only use first block date"
echo "Expected: Unit test should fail"
echo ""

cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
# Replace the entire function body to just return firstBlockDate
cat > "$PROGRESS_START_FILE" << 'EOF'
import type { Database } from "@/lib/database.types";

type SessionType = Database["public"]["Enums"]["day_type"];

export function progressStartDate(input: {
  programs: Array<{ startedOn: string }>;
  completedSessions: Array<{
    local_date: string;
    actual_type: SessionType | null;
    status: string;
    working_set_count?: number;
  }>;
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

MUTANT2_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT2_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 2 (unit test passes with only first block date)"
  cat "$MUTANT2_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT2_LOG"; then
    echo "✗ FAIL: Mutant 2 killed by crash, not assertion"
    cat "$MUTANT2_LOG"
    exit 1
  fi
  echo "✓ Mutant 2 killed (unit test fails without session date consideration)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT2_LOG"

# Restore for next mutant
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"

# Mutant 3: Revert buildDayRecords min() logic to ?? fallback
echo ""
echo "Mutant 3: Revert buildDayRecords to use ?? instead of min()"
echo "Expected: Unit test should fail"
echo ""

cp "$BACKUP_STREAKS" "$STREAKS_FILE"
# Replace the min logic with just ?? fallback (remove the if/else that picks the earlier date)
sed -i '/Fix pd-b: Use the EARLIER of effectiveStart/,/^  }$/c\
  // Fix pd-b: Use the EARLIER of effectiveStart and firstBlockStart\
  // so a later effectiveStart can never cut off block days\
  const first = effectiveStart ?? firstBlockStart;' "$STREAKS_FILE"

# Verify the mutation applied  
if diff -q "$BACKUP_STREAKS" "$STREAKS_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 3 did not apply (files are identical)"
  exit 1
fi

MUTANT3_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT3_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 3 (unit test passes with ?? fallback)"
  cat "$MUTANT3_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT3_LOG"; then
    echo "✗ FAIL: Mutant 3 killed by crash, not assertion"
    cat "$MUTANT3_LOG"
    exit 1
  fi
  echo "✓ Mutant 3 killed (unit test fails without min() logic)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT3_LOG"

# Restore
cp "$BACKUP_STREAKS" "$STREAKS_FILE"

# Mutant 4: Comment out ensureCurrentBlock call from rebuildPlanCore
echo ""
echo "Mutant 4: Comment out ensureCurrentBlock call from rebuildPlanCore"
echo "Expected: Unit test (test-rebuild-rollover-progress.ts) should fail"
echo ""

cp "$BACKUP_CORE" "$REBUILD_CORE"
# Comment out the ensureCurrentBlock call and error check
sed -i '/const rollover = await deps.ensureCurrentBlock/,/^  }$/s/^/\/\/ /' "$REBUILD_CORE"

# Verify the mutation applied
if diff -q "$BACKUP_CORE" "$REBUILD_CORE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 4 did not apply (files are identical)"
  exit 1
fi

MUTANT4_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT4_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 4 (unit test passes with commented call)"
  cat "$MUTANT4_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT4_LOG"; then
    echo "✗ FAIL: Mutant 4 killed by crash, not assertion"
    cat "$MUTANT4_LOG"
    exit 1
  fi
  echo "✓ Mutant 4 killed (unit test fails with commented call)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT4_LOG"

# Restore
cp "$BACKUP_CORE" "$REBUILD_CORE"

# Mutant 5: Change >= to > in rollover last-day check
echo ""
echo "Mutant 5: Change >= to > in rollover last-day check"
echo "Expected: Unit test should fail (last-day rebuild scenario)"
echo ""

cp "$BACKUP_ROLLOVER" "$ROLLOVER_FILE"
# Change active.ends_on >= today to active.ends_on > today
sed -i 's/active\.ends_on >= today/active.ends_on > today/g' "$ROLLOVER_FILE"
# Also change retry.ends_on >= today to retry.ends_on > today
sed -i 's/retry\.ends_on >= today/retry.ends_on > today/g' "$ROLLOVER_FILE"

# Verify the mutation applied
if diff -q "$BACKUP_ROLLOVER" "$ROLLOVER_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 5 did not apply (files are identical)"
  exit 1
fi

MUTANT5_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT5_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 5 (unit test passes with > instead of >=)"
  cat "$MUTANT5_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT5_LOG"; then
    echo "✗ FAIL: Mutant 5 killed by crash, not assertion"
    cat "$MUTANT5_LOG"
    exit 1
  fi
  echo "✓ Mutant 5 killed (unit test fails with > instead of >=)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT5_LOG"

# Restore
cp "$BACKUP_ROLLOVER" "$ROLLOVER_FILE"

# Mutant 6: Comment out rebuildPlanCore call from buildPlan wiring test
echo ""
echo "Mutant 6: Skip rebuildPlanCore in buildPlan (production wiring)"
echo "Expected: Unit test should detect missing core logic"
echo ""

ACTIONS_FILE="src/app/today/actions.ts"
BACKUP_ACTIONS_MED2="$TMP/actions-med2.ts"
cp "$ACTIONS_FILE" "$BACKUP_ACTIONS_MED2"

# Comment out the rebuildPlanCore call
sed -i '/const result = await rebuildPlanCore/,/return { ok: false, error: result.error };/s/^/\/\/ /' "$ACTIONS_FILE"

# Verify mutation applied
if diff -q "$BACKUP_ACTIONS_MED2" "$ACTIONS_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 6 did not apply"
  exit 1
fi

MUTANT6_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT6_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 6 (wiring test passes without rebuildPlanCore call)"
  cat "$MUTANT6_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  echo "✓ Mutant 6 killed (wiring test detects missing rebuildPlanCore)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT6_LOG"

# Restore
cp "$BACKUP_ACTIONS_MED2" "$ACTIONS_FILE"

# Mutant 7: Change effectiveStart min() to ?? in progress wiring
echo ""
echo "Mutant 7: Change effectiveStart min to ?? (progress loader wiring)"
echo "Expected: Unit test should detect incorrect date calculation"
echo ""

# Already have PROGRESS_START_FILE backup
# Change the min logic to ?? fallback in effectiveStart calculation
sed -i 's/firstSessionDate < firstBlockDate ? firstSessionDate : firstBlockDate/firstSessionDate ?? firstBlockDate/g' "$PROGRESS_START_FILE"

# Verify mutation applied
if diff -q "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 7 did not apply"
  exit 1
fi

MUTANT7_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT7_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 7 (progress test passes with ?? instead of min)"
  cat "$MUTANT7_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT7_LOG"; then
    echo "✗ FAIL: Mutant 7 killed by crash, not assertion"
    cat "$MUTANT7_LOG"
    exit 1
  fi
  echo "✓ Mutant 7 killed (progress test detects incorrect date logic)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT7_LOG"

# Restore
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"

echo ""
echo "============================================================"
echo "Summary: $KILLED killed, $SURVIVED survived"
echo "============================================================"
echo ""

cleanup_done=1
cp "$BACKUP_CORE" "$REBUILD_CORE"
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
cp "$BACKUP_STREAKS" "$STREAKS_FILE"
cp "$BACKUP_ROLLOVER" "$ROLLOVER_FILE"
rm -rf "$TMP"

if [ $SURVIVED -gt 0 ]; then
  echo "❌ FAIL: $SURVIVED mutants survived"
  exit 1
fi

echo "✅ All $KILLED mutants killed"
exit 0
