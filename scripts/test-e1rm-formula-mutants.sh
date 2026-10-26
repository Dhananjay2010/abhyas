#!/usr/bin/env bash
#
# Mutation tests for capped e1RM formula.
#
# Verifies that tests catch regression cases:
# M1: Remove cap in TS (estimateOneRepMax)
# M2v: Remove cap in SQL view (view definition)
# M3: Drop reps=1 case in SQL recompute
# M3v: Drop reps=1 case in SQL view
# M4: Skip recompute UPDATE
# M5: Drop se.status = 'completed' from recompute
# M6: Drop ss.is_warmup_set = false from recompute
#
# Run: DATABASE_URL=postgresql://ubuntu@localhost:5432/abhyas_test REQUIRE_DB=1 bash scripts/test-e1rm-formula-mutants.sh

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  if [ "${REQUIRE_DB:-0}" = "1" ]; then
    echo "❌ REQUIRE_DB=1 but DATABASE_URL is not set"
    exit 1
  fi
  echo "⏭️  Skipping mutant tests (DATABASE_URL not set)"
  echo "   Set DATABASE_URL=postgresql://ubuntu@localhost:5432/abhyas_test to run"
  exit 0
fi

TEMP_DIR=$(mktemp -d)

# Backup files
cp src/lib/program/progression.ts "${TEMP_DIR}/progression.ts.bak"
cp supabase/migrations/20261025000030_align_e1rm_formula.sql "${TEMP_DIR}/migration.sql.bak"

cleanup() {
  echo ""
  echo "Restoring original files..."
  cp "${TEMP_DIR}/progression.ts.bak" src/lib/program/progression.ts
  cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql
  rm -rf "$TEMP_DIR"
}

trap cleanup EXIT INT TERM

echo "Running e1RM formula mutation tests..."
echo ""

# Run baseline first
echo "Baseline: Running unmutated test (must pass)"
if ! npm run test:e1rm-formula-db > "${TEMP_DIR}/baseline.log" 2>&1; then
  echo "✗ BASELINE FAILED: unmutated test did not pass"
  echo ""
  echo "First failure from baseline:"
  grep -m 1 "✗" "${TEMP_DIR}/baseline.log" || grep -m 1 "FAIL" "${TEMP_DIR}/baseline.log" || tail -20 "${TEMP_DIR}/baseline.log"
  exit 1
fi
echo "✓ Baseline passed"
echo ""

# Helper to run a mutant test
run_mutant() {
  local name="$1"
  local logfile="${TEMP_DIR}/${name}.log"
  
  if npm run test:e1rm-formula-db > "$logfile" 2>&1; then
    echo "✗ ${name}: SURVIVED (test passed)"
    return 1
  fi
  
  # Check if it was a genuine test failure (KILLED) or a crash (ERROR)
  if grep -q "✗\|FAIL" "$logfile"; then
    # Killed by a test assertion
    echo "✓ ${name}: KILLED"
    echo "   First failure:"
    grep -m 1 "✗\|FAIL" "$logfile" | sed 's/^/   /'
    return 0
  else
    # Crashed or errored without a clear test failure
    echo "✗ ${name}: ERROR (crashed without test failure)"
    echo "   Error output:"
    tail -10 "$logfile" | sed 's/^/   /'
    return 1
  fi
}

# M1: Remove cap in TS
echo "M1: Remove 12-rep cap in TypeScript (estimateOneRepMax)"
sed -i 's/const capped = Math.min(reps, 12);/const capped = reps;/' src/lib/program/progression.ts

if cmp -s "${TEMP_DIR}/progression.ts.bak" src/lib/program/progression.ts; then
  echo "✗ M1: sed did not change progression.ts"
  exit 1
fi

if npx tsx scripts/test-e1rm-consistency.ts > "${TEMP_DIR}/M1.log" 2>&1; then
  echo "✗ M1: SURVIVED (test passed without cap in TS)"
  exit 1
fi

echo "✓ M1: KILLED (test-e1rm-consistency.ts caught uncapped TS)"

# Restore for M2v
cp "${TEMP_DIR}/progression.ts.bak" src/lib/program/progression.ts

echo ""

# M2v: Remove cap in SQL view (view definition only)
echo "M2v: Remove 12-rep cap in SQL view"
# Target only the view's line, not the recompute
sed -i '/create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/round(ss\.weight_kg \* (30 + least(ss\.reps, 12)) \/ 30, 2)/round(ss.weight_kg * (30 + ss.reps) \/ 30, 2)/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M2v: sed did not change migration"
  exit 1
fi

run_mutant "M2v" || exit 1

# Restore for M3
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M3: Change reps=1 to use formula in recompute (w*1.0333 instead of w)
echo "M3: Change reps=1 to use formula in recompute (w*1.0333 instead of w)"
# Target only the recompute UPDATE's CASE statement
# Change "when ss.reps = 1 then ss.weight_kg" to "when ss.reps = 1 then round(ss.weight_kg * 31 / 30, 2)"
sed -i '/^update exercise_progress ep$/,/^  and ep\.best_e1rm is distinct from s\.e1rm;$/s/when ss\.reps = 1 then ss\.weight_kg/when ss.reps = 1 then round(ss.weight_kg * 31 \/ 30, 2)/g' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M3: sed did not change migration"
  exit 1
fi

run_mutant "M3" || exit 1

# Restore for M3v
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M3v: Change reps=1 to use formula in view (w*1.0333 instead of w)
echo "M3v: Change reps=1 to use formula in view (w*1.0333 instead of w)"
# Target only the view's CASE statement
# Change "when ss.reps = 1 then ss.weight_kg" to "when ss.reps = 1 then round(ss.weight_kg * 31 / 30, 2)"
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/when ss\.reps = 1 then ss\.weight_kg/when ss.reps = 1 then round(ss.weight_kg * 31 \/ 30, 2)/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M3v: sed did not change migration"
  exit 1
fi

run_mutant "M3v" || exit 1

# Restore for M4
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M4: Skip recompute UPDATE
echo "M4: Comment out recompute UPDATE"
sed -i '/^update exercise_progress ep$/,/^  and ep\.best_e1rm is distinct from s\.e1rm;$/s/^/-- /' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M4: sed did not change migration"
  exit 1
fi

run_mutant "M4" || exit 1

# Restore for M5
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M5: Drop se.status = 'completed' from recompute (not view)
echo "M5: Remove se.status = 'completed' filter from recompute UPDATE"
# Target only the recompute's WHERE clause (line with "where se.status"), not the view's AND
sed -i '/^update exercise_progress ep$/,/^  and ep\.best_e1rm is distinct from s\.e1rm;$/s/where se\.status = .completed./where true/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M5: sed did not change migration"
  exit 1
fi

run_mutant "M5" || exit 1

# Restore for M5v
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M5v: Drop se.status = 'completed' from view (not recompute)
echo "M5v: Remove se.status = 'completed' filter from view"
# Target only the view's AND clause
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/and se\.status = .completed.//' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M5v: sed did not change migration"
  exit 1
fi

run_mutant "M5v" || exit 1

# Restore for M6
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M6: Drop ss.is_warmup_set = false from recompute
echo "M6: Remove ss.is_warmup_set = false filter from recompute"
# Target only the recompute UPDATE
sed -i '/^update exercise_progress ep$/,/^  and ep\.best_e1rm is distinct from s\.e1rm;$/s/and ss\.is_warmup_set = false//' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M6: sed did not change migration"
  exit 1
fi

run_mutant "M6" || exit 1

# Restore for M6v
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M6v: Drop ss.is_warmup_set = false from view
echo "M6v: Remove ss.is_warmup_set = false filter from view"
# Target only the view
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/and ss\.is_warmup_set = false//' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M6v: sed did not change migration"
  exit 1
fi

run_mutant "M6v" || exit 1

# Restore for M7v
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M7v: Drop s.status = 'completed' from view (session status filter)
echo "M7v: Remove s.status = 'completed' filter from view"
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/and s\.status = .completed.//' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M7v: sed did not change migration"
  exit 1
fi

run_mutant "M7v" || exit 1

echo ""
echo "✅ All e1RM formula mutation tests passed (1 baseline + M1 + M2v + M3 + M3v + M4 + M5 + M5v + M6 + M6v + M7v)"
