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

if REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > /tmp/mutant1.log 2>&1; then
  echo "✗ SURVIVED: Mutant 1 (test passes without rollover)"
  cat /tmp/mutant1.log
  SURVIVED=$((SURVIVED + 1))
else
  # Check that test actually ran (not skipped)
  if grep -q "⏭️.*Skipping" /tmp/mutant1.log; then
    echo "✗ FAIL: Mutant test was skipped, not actually run"
    cat /tmp/mutant1.log
    exit 1
  fi
  # Check that an assertion killed it
  if ! grep -q "❌ FAIL" /tmp/mutant1.log; then
    echo "✗ FAIL: Mutant 1 killed by crash, not assertion"
    cat /tmp/mutant1.log
    exit 1
  fi
  echo "✓ Mutant 1 killed (test fails without rollover)"
  KILLED=$((KILLED + 1))
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

if REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > /tmp/mutant2.log 2>&1; then
  echo "✗ SURVIVED: Mutant 2 (test passes with only first block date)"
  cat /tmp/mutant2.log
  SURVIVED=$((SURVIVED + 1))
else
  if grep -q "⏭️.*Skipping" /tmp/mutant2.log; then
    echo "✗ FAIL: Mutant test was skipped, not actually run"
    cat /tmp/mutant2.log
    exit 1
  fi
  if ! grep -q "❌ FAIL" /tmp/mutant2.log; then
    echo "✗ FAIL: Mutant 2 killed by crash, not assertion"
    cat /tmp/mutant2.log
    exit 1
  fi
  echo "✓ Mutant 2 killed (test fails without session date consideration)"
  KILLED=$((KILLED + 1))
fi

# Restore for next mutant
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"

# Mutant 3: Revert buildDayRecords min() logic to ?? fallback
echo ""
echo "Mutant 3: Revert buildDayRecords to use ?? instead of min()"
echo "Expected: test-rebuild-rollover-progress-real-db.ts should fail"
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

if REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > /tmp/mutant3.log 2>&1; then
  echo "✗ SURVIVED: Mutant 3 (test passes with ?? fallback)"
  cat /tmp/mutant3.log
  SURVIVED=$((SURVIVED + 1))
else
  if grep -q "⏭️.*Skipping" /tmp/mutant3.log; then
    echo "✗ FAIL: Mutant test was skipped, not actually run"
    cat /tmp/mutant3.log
    exit 1
  fi
  if ! grep -q "❌ FAIL" /tmp/mutant3.log; then
    echo "✗ FAIL: Mutant 3 killed by crash, not assertion"
    cat /tmp/mutant3.log
    exit 1
  fi
  echo "✓ Mutant 3 killed (test fails without min() logic)"
  KILLED=$((KILLED + 1))
fi

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

if npx tsx scripts/test-rebuild-rollover-progress.ts > /tmp/mutant4.log 2>&1; then
  echo "✗ SURVIVED: Mutant 4 (unit test passes with commented call)"
  cat /tmp/mutant4.log
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" /tmp/mutant4.log; then
    echo "✗ FAIL: Mutant 4 killed by crash, not assertion"
    cat /tmp/mutant4.log
    exit 1
  fi
  echo "✓ Mutant 4 killed (unit test fails with commented call)"
  KILLED=$((KILLED + 1))
fi

# Restore
cp "$BACKUP_CORE" "$REBUILD_CORE"

echo ""
echo "============================================================"
echo "Summary: $KILLED killed, $SURVIVED survived"
echo "============================================================"
echo ""

cleanup_done=1
cp "$BACKUP_ACTIONS" "$ACTIONS_FILE"
cp "$BACKUP_CORE" "$REBUILD_CORE"
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
cp "$BACKUP_STREAKS" "$STREAKS_FILE"
rm -rf "$TMP"

if [ $SURVIVED -gt 0 ]; then
  echo "❌ FAIL: $SURVIVED mutants survived"
  exit 1
fi

echo "✅ All $KILLED mutants killed"
exit 0
