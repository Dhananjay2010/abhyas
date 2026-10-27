#!/usr/bin/env bash
set -uo pipefail

# Mutant test script for migration 042 (gym_join_codes_perf)
# Tests that removing key changes causes test failures
# Uses sed over supabase/migrations/*042*.sql with cmp guards and trap restore

echo "=== Mutant Testing: Migration 042 (Join Code Perf) ==="
echo

# Skip if REAL_DB is not set
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⏭️  Skipping mutant tests (REAL_DB=1 not set)"
  echo "   Set REAL_DB=1 to run these tests against a local Supabase instance"
  echo
  exit 0
fi

# Source guard
source "$(dirname "$0")/lib-db-reset-guard.sh"
if ! check_db_reset_guard_bash check "supabase/config.toml"; then
  echo "❌ DB reset guard check failed:"
  check_db_reset_guard_bash explain "supabase/config.toml"
  exit 1
fi

# In CI, default SUPABASE_DB_URL if not set
if [ "${CI:-}" = "true" ] && [ -z "${SUPABASE_DB_URL:-}" ]; then
  export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  echo "CI: Using default SUPABASE_DB_URL"
  echo
fi

MIGRATION_FILE="supabase/migrations/20261025000042_gym_join_codes_perf.sql"

# Check migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

FAILED=0
SURVIVORS=()
SKIPPED=()
KILLED=0
TOTAL_MUTANTS=7

# Use main's reset pattern
if [ "${CI:-}" = "true" ] && [ "${SUPABASE_DB_URL:-}" = "postgresql://postgres:postgres@localhost:54322/postgres" ]; then
  RESET_CMD="supabase db reset"
else
  RESET_CMD="supabase db reset --db-url \"$SUPABASE_DB_URL\""
fi

echo "Running baseline tests..."
BASELINE_OUTPUT=$(mktemp)
if ! eval "$RESET_CMD" > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi

if ! REAL_DB=1 npm run test:gym-join-codes-comprehensive > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests." >&2
  echo "Full baseline output:"
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi
rm -f "$BASELINE_OUTPUT"
echo "✓ Baseline tests pass"
echo

run_mutant() {
  local name="$1"
  local description="$2"
  local sed_pattern="$3"
  local expected_fail="$4"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Backup migration file
  cp "$MIGRATION_FILE" "$MIGRATION_FILE.backup"
  trap "mv '$MIGRATION_FILE.backup' '$MIGRATION_FILE' 2>/dev/null || true" EXIT RETURN
  
  # Apply mutation
  local mutated_file=$(mktemp)
  if ! sed "$sed_pattern" "$MIGRATION_FILE" > "$mutated_file"; then
    echo "  ❌ SKIP: sed command failed"
    SKIPPED+=("$name: sed failed")
    FAILED=$((FAILED + 1))
    rm -f "$mutated_file"
    trap - EXIT RETURN
    mv "$MIGRATION_FILE.backup" "$MIGRATION_FILE"
    return 1
  fi
  
  # Verify sed changed the file
  if cmp -s "$MIGRATION_FILE" "$mutated_file"; then
    echo "  ❌ SKIP: sed did not change the file (pattern not found)"
    SKIPPED+=("$name: sed pattern not found")
    FAILED=$((FAILED + 1))
    rm -f "$mutated_file"
    trap - EXIT RETURN
    mv "$MIGRATION_FILE.backup" "$MIGRATION_FILE"
    return 1
  fi
  
  mv "$mutated_file" "$MIGRATION_FILE"
  
  # Reset database (applies mutated migration)
  local reset_output=$(mktemp)
  if ! eval "$RESET_CMD" > "$reset_output" 2>&1; then
    echo "  ❌ SKIP: db reset failed"
    SKIPPED+=("$name: db reset failed")
    FAILED=$((FAILED + 1))
    rm -f "$reset_output"
    trap - EXIT RETURN
    mv "$MIGRATION_FILE.backup" "$MIGRATION_FILE"
    return 1
  fi
  rm -f "$reset_output"
  
  # Run tests
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:gym-join-codes-comprehensive > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
    echo "  Last 20 lines of test output:"
    tail -20 "$test_output" | sed 's/^/    /'
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
    rm -f "$test_output"
    trap - EXIT RETURN
    mv "$MIGRATION_FILE.backup" "$MIGRATION_FILE"
    return 1
  fi
  
  # Check for expected FAIL line
  if grep -qF "$expected_fail" "$test_output"; then
    echo "  ✅ KILLED by expected assertion"
    KILLED=$((KILLED + 1))
  else
    echo "  ❌ SKIP: killed but not by expected assertion"
    echo "  Expected: $expected_fail"
    echo "  FAIL lines found:"
    grep "FAIL" "$test_output" | head -5 | sed 's/^/    /' || echo "    (no FAIL lines)"
    SKIPPED+=("$name: wrong assertion")
    FAILED=$((FAILED + 1))
    rm -f "$test_output"
    trap - EXIT RETURN
    mv "$MIGRATION_FILE.backup" "$MIGRATION_FILE"
    return 1
  fi
  
  rm -f "$test_output"
  
  # Restore and reset
  trap - EXIT RETURN
  mv "$MIGRATION_FILE.backup" "$MIGRATION_FILE"
  local cleanup_output=$(mktemp)
  eval "$RESET_CMD" > "$cleanup_output" 2>&1 || { echo "⚠️  Post-mutant reset failed"; cat "$cleanup_output"; }
  rm -f "$cleanup_output"
  
  return 0
}

# Mutant (a): Remove gym_name from already_member returns
run_mutant \
  "(a) already_member returns no gym_name" \
  "Remove gym_name from already_member jsonb_build_object calls" \
  "/already_member/s/, 'gym_name', v_code_record.gym_name//g" \
  "FAIL already_member includes gym_name"

# Mutant (b): Remove gym_name from success return
run_mutant \
  "(b) success returns no gym_name" \
  "Remove gym_name from final success jsonb_build_object" \
  "/return jsonb_build_object('ok', true, 'gym_id'/s/, 'gym_name', v_code_record.gym_name//g" \
  "FAIL Success returns gym_name"

# Mutant (c): Don't join gyms table (gym_name unavailable)
run_mutant \
  "(c) don't join gyms table" \
  "Remove JOIN gyms so gym_name is not available" \
  "/join public.gyms on/d; /public.gyms.name as gym_name/d" \
  "FAIL Success returns gym_name"

# Mutant (d): Drop the created_by index
run_mutant \
  "(d) drop created_by index" \
  "Remove index creation on created_by column" \
  "/create index.*gym_join_codes_created_by_idx/d" \
  "FAIL Index gym_join_codes_created_by_idx exists"

# Mutant (e): Keep separate policies (don't merge)
run_mutant \
  "(e) keep separate policies" \
  "Keep old separate policies instead of merging" \
  "/drop policy if exists gym_join_codes_select/,/end \$\$/d" \
  "FAIL Single merged SELECT policy exists"

# Mutant (f): Merged policy too permissive (always true)
run_mutant \
  "(f) merged policy too permissive" \
  "Change merged policy USING to always true" \
  "s/using (\$/using (true/; /\(select public.is_gym_owner/,/);$/d" \
  "FAIL Member cannot see other gym codes"

# Mutant (g): Merged policy missing staff restriction for member codes
run_mutant \
  "(g) staff can see staff codes" \
  "Remove role = 'member' restriction from staff clause" \
  "s/and role = 'member'//" \
  "FAIL Staff cannot see staff codes"

echo
echo "=== Mutant Test Summary ==="
echo "Total mutants: $TOTAL_MUTANTS"
echo "Killed: $KILLED"
echo "Survived: ${#SURVIVORS[@]}"
echo "Skipped (failed to run or wrong assertion): $((FAILED - ${#SURVIVORS[@]}))"
echo

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "❌ Survivors (tests passed when they should fail):"
  printf '  - %s\n' "${SURVIVORS[@]}"
  echo
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "❌ Skipped/Wrong assertion:"
  printf '  - %s\n' "${SKIPPED[@]}"
  echo
fi

if [ $FAILED -gt 0 ]; then
  echo "❌ FAIL: $FAILED mutants not properly killed"
  exit 1
fi

echo "✅ All $TOTAL_MUTANTS mutants killed with correct assertions"
exit 0
