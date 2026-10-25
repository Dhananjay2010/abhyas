#!/usr/bin/env bash
#
# Mutation tests for e1RM formula fix.
#
# Verifies that test-e1rm-formula-db.ts catches both regression cases:
# M1: Restoring least(reps,12) cap must fail test 2 (high reps)
# M2: Dropping reps=1 case must fail test 1 (reps=1)
#
# Run: DATABASE_URL=postgres://postgres:postgres@localhost/abhyas_test bash scripts/test-e1rm-formula-mutants.sh

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
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
sed -i.bak 's/max(case when ss\.reps = 1 then ss\.weight_kg else ss\.weight_kg \* (1 + ss\.reps \/ 30\.0) end)/max(ss.weight_kg * (1 + least(ss.reps, 12) \/ 30.0))/' "$MIGRATION_FILE"

if npm run test:e1rm-formula-db 2>&1 | tee /tmp/mutant-m1.log | grep -q "15 reps gives uncapped e1RM.*FAIL"; then
  echo "✓ M1: Test correctly fails on capped formula"
else
  echo "✗ M1: Test should have failed on capped formula but didn't"
  cat /tmp/mutant-m1.log
  exit 1
fi

# Restore for M2
cp "$BACKUP_FILE" "$MIGRATION_FILE"

echo ""

# M2: Drop reps=1 case - should fail test 1 (reps=1)
echo "M2: Dropping reps=1 special case..."
sed -i.bak 's/max(case when ss\.reps = 1 then ss\.weight_kg else ss\.weight_kg \* (1 + ss\.reps \/ 30\.0) end)/max(ss.weight_kg * (1 + ss.reps \/ 30.0))/' "$MIGRATION_FILE"

if npm run test:e1rm-formula-db 2>&1 | tee /tmp/mutant-m2.log | grep -q "reps=1 returns weight itself.*FAIL"; then
  echo "✓ M2: Test correctly fails without reps=1 case"
else
  echo "✗ M2: Test should have failed without reps=1 case but didn't"
  cat /tmp/mutant-m2.log
  exit 1
fi

echo ""
echo "✅ All mutation tests passed"
