#!/usr/bin/env bash
#
# Mutation tests for e1RM formula fix.
#
# Verifies that test-e1rm-formula-db.ts catches both regression cases:
# M1: Restoring least(reps,12) cap must fail test 2 (high reps)
# M2: Dropping reps=1 case must fail test 1 (reps=1)
#
# Run: DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test REQUIRE_DB=1 bash scripts/test-e1rm-formula-mutants.sh

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  if [ "${REQUIRE_DB:-0}" = "1" ]; then
    echo "❌ REQUIRE_DB=1 but DATABASE_URL is not set"
    exit 1
  fi
  echo "⏭️  Skipping mutant tests (DATABASE_URL not set)"
  echo "   Set DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test to run"
  exit 0
fi

MIGRATION_FILE="supabase/migrations/20261025000030_fix_e1rm_formula.sql"
BACKUP_DIR=$(mktemp -d)
BACKUP_FILE="${BACKUP_DIR}/original.sql"

# Backup original and set up cleanup trap
cp "$MIGRATION_FILE" "$BACKUP_FILE"

cleanup() {
  EXIT_CODE=$?
  echo ""
  echo "Restoring original migration..."
  cp "$BACKUP_FILE" "$MIGRATION_FILE"
  rm -rf "$BACKUP_DIR"
  if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ Mutant test failed or errored"
    exit 1
  fi
  exit 0
}

trap cleanup EXIT INT TERM

echo "Running e1RM formula mutation tests..."
echo ""

# M1: Restore least(reps,12) cap - should fail test 2 (high reps)
echo "M1: Restoring least(reps,12) cap..."
sed -i 's/max(case when ss\.reps = 1 then ss\.weight_kg else ss\.weight_kg \* (1 + ss\.reps \/ 30\.0) end)/max(ss.weight_kg * (1 + least(ss.reps, 12) \/ 30.0))/' "$MIGRATION_FILE"

# Check sed actually changed the file
if cmp -s "$BACKUP_FILE" "$MIGRATION_FILE"; then
  echo "✗ M1: sed did not change the migration file"
  exit 1
fi

LOG_FILE="${BACKUP_DIR}/mutant-m1.log"
if npm run test:e1rm-formula-db > "$LOG_FILE" 2>&1; then
  echo "✗ M1: Test should have failed on capped formula but it passed"
  cat "$LOG_FILE"
  exit 1
fi

# Check for the specific FAIL line
if grep -q "FAIL.*15 reps gives uncapped e1RM" "$LOG_FILE"; then
  echo "✓ M1: Test correctly fails on capped formula"
  grep "FAIL.*15 reps gives uncapped e1RM" "$LOG_FILE" | head -1
else
  echo "✗ M1: Test failed but not on the expected line"
  cat "$LOG_FILE"
  exit 1
fi

# Restore for M2
cp "$BACKUP_FILE" "$MIGRATION_FILE"

echo ""

# M2: Drop reps=1 case - should fail test 1 (reps=1)
echo "M2: Dropping reps=1 special case..."
sed -i 's/max(case when ss\.reps = 1 then ss\.weight_kg else ss\.weight_kg \* (1 + ss\.reps \/ 30\.0) end)/max(ss.weight_kg * (1 + ss.reps \/ 30.0))/' "$MIGRATION_FILE"

# Check sed actually changed the file
if cmp -s "$BACKUP_FILE" "$MIGRATION_FILE"; then
  echo "✗ M2: sed did not change the migration file"
  exit 1
fi

LOG_FILE="${BACKUP_DIR}/mutant-m2.log"
if npm run test:e1rm-formula-db > "$LOG_FILE" 2>&1; then
  echo "✗ M2: Test should have failed without reps=1 case but it passed"
  cat "$LOG_FILE"
  exit 1
fi

# Check for the specific FAIL line
if grep -q "FAIL.*reps=1 returns weight itself" "$LOG_FILE"; then
  echo "✓ M2: Test correctly fails without reps=1 case"
  grep "FAIL.*reps=1 returns weight itself" "$LOG_FILE" | head -1
else
  echo "✗ M2: Test failed but not on the expected line"
  cat "$LOG_FILE"
  exit 1
fi

echo ""
echo "✅ All mutation tests passed"
