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
  # Only match actual assertion lines (starting with whitespace + FAIL), not crash summaries
  if grep -q "^Test error:" "$logfile"; then
    echo "✗ ${name}: ERROR (crashed: $(grep -m1 '^Test error:' "$logfile"))"
    tail -10 "$logfile" | sed 's/^/   /'
    return 1
  fi
  
  if grep -qE '^\s+FAIL ' "$logfile"; then
    echo "✓ ${name}: KILLED"
    echo "   First failure:"
    grep -m 1 -E '^\s+FAIL ' "$logfile" | sed 's/^/   /'
    return 0
  fi
  
  echo "✗ ${name}: ERROR (non-zero exit, no assertion failed)"
  tail -10 "$logfile" | sed 's/^/   /'
  return 1
}

# M1: Remove cap in TS
echo "M1: Remove 12-rep cap in TypeScript (estimateOneRepMax)"
sed -i 's/const capped = Math.min(reps, 12);/const capped = reps;/' src/lib/program/progression.ts

if cmp -s "${TEMP_DIR}/progression.ts.bak" src/lib/program/progression.ts; then
  echo "✗ M1: sed did not change progression.ts"
  exit 1
fi

# M1 tests against test-e1rm-consistency.ts, not the DB test
logfile="${TEMP_DIR}/M1.log"
if npx tsx scripts/test-e1rm-consistency.ts > "$logfile" 2>&1; then
  echo "✗ M1: SURVIVED (test passed without cap in TS)"
  exit 1
fi

# Check for genuine test failure vs crash
if grep -q "^SyntaxError\|^Error:\|^TransformError" "$logfile" && ! grep -qE '^\s+FAIL ' "$logfile"; then
  echo "✗ M1: ERROR (crashed without test failure)"
  tail -10 "$logfile" | sed 's/^/   /'
  exit 1
fi

if grep -qE '^\s+FAIL ' "$logfile"; then
  echo "✓ M1: KILLED (test-e1rm-consistency.ts caught uncapped TS)"
  echo "   First failure:"
  grep -m 1 -E '^\s+FAIL ' "$logfile" | sed 's/^/   /'
else
  echo "✗ M1: ERROR (non-zero exit, no assertion failed)"
  tail -10 "$logfile" | sed 's/^/   /'
  exit 1
fi

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

# M6v: Drop is_warmup_set filters from view (both ss and ss2)
echo "M6v: Remove ss.is_warmup_set filters from view"
# Target only the view, remove both WHERE and AND occurrences
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/where ss\.is_warmup_set = false/where true/' supabase/migrations/20261025000030_align_e1rm_formula.sql
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/and ss2\.is_warmup_set = false//' supabase/migrations/20261025000030_align_e1rm_formula.sql

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

# Restore for M8
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M8: Backup 0::numeric instead of best_e1rm
echo "M8: Backup 0 instead of best_e1rm"
sed -i 's/select user_id, exercise_id, best_e1rm$/select user_id, exercise_id, 0::numeric(6,2) as best_e1rm/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M8: sed did not change migration"
  exit 1
fi

run_mutant "M8" || exit 1

# Restore for M9
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M9: Drop backup table creation
echo "M9: Drop backup table creation"
# Comment out the backup creation AND the RLS/revoke lines that follow
sed -i '/^create table if not exists exercise_progress_best_e1rm_backup/,/^revoke all on exercise_progress_best_e1rm_backup_20261025000030/s/^/-- MUTANT: /' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M9: sed did not change migration"
  exit 1
fi

run_mutant "M9" || exit 1

# Restore for M10
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M10: Delete 'is distinct from' condition (makes UPDATE non-idempotent)
echo "M10: Remove 'is distinct from' (breaks idempotency)"
sed -i 's/and ep\.best_e1rm is distinct from s\.e1rm//' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M10: sed did not change migration"
  exit 1
fi

run_mutant "M10" || exit 1

# Restore for M9b
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M9b: Backup taken AFTER the recompute UPDATE
echo "M9b: Backup taken AFTER the recompute UPDATE"
# Move CREATE TABLE + ALTER + REVOKE block to after the UPDATE
perl -0pi -e 's/(-- 2\. Back up existing.*?revoke all on exercise_progress_best_e1rm_backup_20261025000030 from anon, authenticated;\n)(.*)\z/$2$1/s' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M9b: sed did not change migration"
  exit 1
fi

run_mutant "M9b" || exit 1

# Restore for rls_no_revoke
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# rls_no_revoke: Delete the REVOKE line
echo "rls_no_revoke: Delete REVOKE (anon/authenticated can still access backup)"
sed -i '/^revoke all on exercise_progress_best_e1rm_backup_20261025000030 from anon, authenticated;$/d' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ rls_no_revoke: sed did not change migration"
  exit 1
fi

run_mutant "rls_no_revoke" || exit 1

# Restore for rls_grant_all
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# rls_grant_all: Replace REVOKE with GRANT ALL
echo "rls_grant_all: Replace REVOKE with GRANT ALL (explicitly grants privileges)"
sed -i 's/^revoke all on exercise_progress_best_e1rm_backup_20261025000030 from anon, authenticated;$/grant all on exercise_progress_best_e1rm_backup_20261025000030 to anon, authenticated;/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ rls_grant_all: sed did not change migration"
  exit 1
fi

run_mutant "rls_grant_all" || exit 1

# Restore for rls_no_enable
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# rls_no_enable: Delete the ALTER TABLE enable RLS line
echo "rls_no_enable: Delete ALTER TABLE enable RLS (RLS remains disabled)"
sed -i '/^alter table exercise_progress_best_e1rm_backup_20261025000030 enable row level security;$/d' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ rls_no_enable: sed did not change migration"
  exit 1
fi

run_mutant "rls_no_enable" || exit 1

# Restore for view_warmup_only
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# view_warmup_only: Drop first is_warmup_set filter from view
echo "view_warmup_only: Remove ss.is_warmup_set = false from view WHERE"
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/where ss\.is_warmup_set = false/where true/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ view_warmup_only: sed did not change migration"
  exit 1
fi

run_mutant "view_warmup_only" || exit 1

# Restore for cap15_view
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# cap15_view: Change least(reps,12) to least(reps,15) in view only
echo "cap15_view: Cap at 15 reps instead of 12 in view"
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/least(ss\.reps, 12)/least(ss.reps, 15)/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ cap15_view: sed did not change migration"
  exit 1
fi

run_mutant "cap15_view" || exit 1

# Restore for cap15_rec
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# cap15_rec: Change least(reps,12) to least(reps,15) in recompute only
echo "cap15_rec: Cap at 15 reps instead of 12 in recompute"
sed -i '/^update exercise_progress ep$/,/^  and ep\.best_e1rm is distinct from s\.e1rm;$/s/least(ss\.reps, 12)/least(ss.reps, 15)/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ cap15_rec: sed did not change migration"
  exit 1
fi

run_mutant "cap15_rec" || exit 1

# Restore for swap_view
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# swap_view: Use swapped_from_exercise_id in view
echo "swap_view: se.exercise_id → coalesce(swapped_from, exercise_id) in view"
# Replace in SELECT list with alias, and in GROUP BY
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/{
  s/^\s*se\.exercise_id,$/  coalesce(se.swapped_from_exercise_id, se.exercise_id) as exercise_id,/
  s/group by ss\.user_id, se\.exercise_id,/group by ss.user_id, coalesce(se.swapped_from_exercise_id, se.exercise_id),/
}' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ swap_view: sed did not change migration"
  exit 1
fi

run_mutant "swap_view" || exit 1

# Restore for swap_rec
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# swap_rec: Use swapped_from_exercise_id in recompute
echo "swap_rec: se.exercise_id → coalesce(swapped_from, exercise_id) in recompute"
# Replace in SELECT list (which becomes the column in the subquery) and GROUP BY
sed -i '/^update exercise_progress ep$/,/^  and ep\.best_e1rm is distinct from s\.e1rm;$/{
  s/\s*se\.exercise_id,$/    coalesce(se.swapped_from_exercise_id, se.exercise_id) as exercise_id,/
  s/group by ss\.user_id, se\.exercise_id$/  group by ss.user_id, coalesce(se.swapped_from_exercise_id, se.exercise_id)/
}' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ swap_rec: sed did not change migration"
  exit 1
fi

run_mutant "swap_rec" || exit 1

# Restore for view_reps1
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# view_reps1: Remove reps=1 special case from view
echo "view_reps1: View uses w*1.0333 at reps=1 (removes when ss.reps = 1)"
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/when ss\.reps = 1 then ss\.weight_kg/when false then ss.weight_kg/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ view_reps1: sed did not change migration"
  exit 1
fi

run_mutant "view_reps1" || exit 1

# Restore for M11
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""

# M11: round → trunc in view (killed by sweep Test 10B)
echo "M11: View round → trunc"
sed -i '/^create or replace view exercise_strength_history/,/^grant select on exercise_strength_history/s/round(ss\.weight_kg \* (30 + least(ss\.reps, 12)) \/ 30, 2)/trunc(ss.weight_kg * (30 + least(ss.reps, 12)) \/ 30, 2)/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if cmp -s "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql; then
  echo "✗ M11: sed did not change migration"
  exit 1
fi

run_mutant "M11" || exit 1

# Restore migration for self-test
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""
echo "Self-test: Verify crash handling (inject syntax error)"
sed -i 's/^update exercise_progress ep$/updat exercise_progress ep/' supabase/migrations/20261025000030_align_e1rm_formula.sql

if run_mutant "crash_test"; then
  echo "✗ SELF-TEST FAILED: crash reported as KILLED"
  cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql
  exit 1
fi

echo "✓ Self-test passed: crash correctly reported as ERROR"
cp "${TEMP_DIR}/migration.sql.bak" supabase/migrations/20261025000030_align_e1rm_formula.sql

echo ""
echo "✅ All e1RM formula mutation tests passed"
