#!/usr/bin/env bash
set -uo pipefail  # No -e so all mutants run

# Mutant test script for gym branding RLS/RPC
# Tests that removing key constraints or RPC guards causes test failures
# Builds mutated SQL by sed over the real 040 migration file

echo "=== Mutant Testing: Gym Branding RLS/RPC ==="
echo

# Skip if REAL_DB is not set
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⏭️  Skipping mutant tests (REAL_DB=1 not set)"
  echo "   Set REAL_DB=1 to run these tests against a local Supabase instance"
  echo
  exit 0
fi

# Source guard and check
source "$(dirname "$0")/lib-db-reset-guard.sh"
if ! check_db_reset_guard_bash check "supabase/config.toml"; then
  echo "❌ DB reset guard check failed:"
  check_db_reset_guard_bash explain "supabase/config.toml"
  exit 1
fi

# In CI, default SUPABASE_DB_URL if not set
if [ "${CI:-}" = "true" ] && [ -z "${SUPABASE_DB_URL:-}" ]; then
  export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  echo "CI: Using default SUPABASE_DB_URL: $SUPABASE_DB_URL"
  echo
fi

# Verify migration file exists
MIGRATION_FILE="supabase/migrations/20261025000040_gym_branding.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

FAILED=0
SURVIVORS=()
SKIPPED=()

echo "Running baseline tests..."
BASELINE_OUTPUT=$(mktemp)
if ! supabase db reset > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi

if ! REAL_DB=1 npm run test:gym-branding-real-db > "$BASELINE_OUTPUT" 2>&1; then
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
  local sed_command="$3"
  local expected_fail_line="$4"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  local reset_output=$(mktemp)
  if ! supabase db reset > "$reset_output" 2>&1; then
    echo "  ❌ SKIPPED: db reset failed"
    SKIPPED+=("$name: db reset failed")
    rm -f "$reset_output"
    sleep 2
    return 0
  fi
  rm -f "$reset_output"
  
  # Build mutated SQL
  local mutated_file=$(mktemp)
  trap "rm -f '$mutated_file'" RETURN
  
  eval "$sed_command '$MIGRATION_FILE'" > "$mutated_file"
  
  # Verify sed changed the file
  if cmp -s "$MIGRATION_FILE" "$mutated_file"; then
    echo "  ⚠️  SKIPPED: sed did not change the file"
    SKIPPED+=("$name: sed pattern not found")
    sleep 2
    return 0
  fi
  
  # Apply mutated SQL
  local mutation_output=$(mktemp)
  if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f "$mutated_file" > "$mutation_output" 2>&1; then
    echo "  ❌ SKIPPED: mutation SQL failed"
    echo "  psql error:"
    cat "$mutation_output" | head -10 | sed 's/^/    /'
    SKIPPED+=("$name: mutation failed")
    rm -f "$mutation_output"
    sleep 2
    return 0
  fi
  rm -f "$mutation_output"
  
  # Run tests and capture output
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:gym-branding-real-db > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
    echo "  Last 20 lines of test output:"
    tail -20 "$test_output" | sed 's/^/    /'
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    # Check for expected FAIL line
    if grep -qF "$expected_fail_line" "$test_output"; then
      echo "  ✅ KILLED (expected: $expected_fail_line)"
    else
      echo "  ⚠️  Test failed but not with expected line"
      echo "  Expected: $expected_fail_line"
      echo "  FAIL lines found:"
      grep "FAIL" "$test_output" | head -5 | sed 's/^/    /'
    fi
  fi
  rm -f "$test_output"
  
  sleep 2
  return 0
}

# Mutant (a): Remove owner check from set_gym_branding
run_mutant \
  "(a) remove owner check" \
  "Allow any authenticated user to update branding" \
  "sed '/IF NOT EXISTS (SELECT 1 FROM public.gym_memberships/,/END IF;/d' <" \
  "FAIL Non-owner cannot update branding"

# Mutant (b): Add anon grant to set_gym_branding
run_mutant \
  "(b) add anon grant" \
  "Allow anonymous users to call set_gym_branding" \
  "sed 's/grant execute on function public.set_gym_branding/grant execute on function public.set_gym_branding(uuid, text, text, text, text, text[]) to anon;\ngrant execute on function public.set_gym_branding/' <" \
  "FAIL Anon cannot call set_gym_branding"

# Mutant (c): Drop primary_color CHECK constraint
run_mutant \
  "(c) drop primary_color CHECK" \
  "Allow invalid primary_color values" \
  "sed '/add constraint gyms_primary_color_hex/d' <" \
  "FAIL Invalid primary_color rejected"

# Mutant (d): Drop accent_color CHECK constraint
run_mutant \
  "(d) drop accent_color CHECK" \
  "Allow invalid accent_color values" \
  "sed '/add constraint gyms_accent_color_hex/d' <" \
  "FAIL Invalid accent_color rejected"

# Mutant (e): Drop logo_url CHECK constraint
run_mutant \
  "(e) drop logo_url CHECK" \
  "Allow invalid logo_url values" \
  "sed '/add constraint gyms_logo_url_format/,/);/d' <" \
  "FAIL Invalid logo_url rejected"

# Mutant (f): Make set_gym_branding SECURITY INVOKER
run_mutant \
  "(f) SECURITY INVOKER" \
  "Change SECURITY DEFINER to INVOKER (RLS blocks)" \
  "sed 's/security definer/security invoker/' <" \
  "FAIL Owner can update via set_gym_branding"

# Mutant (g): Remove search_path from set_gym_branding
run_mutant \
  "(g) remove search_path" \
  "Remove search_path='' (allows schema injection)" \
  "sed \"s/set search_path = ''//\" <" \
  "FAIL Owner can update via set_gym_branding"

echo
echo "=== Mutation Testing Summary ==="
echo "Failed: $FAILED"
echo "Survivors: ${#SURVIVORS[@]}"
echo "Skipped: ${#SKIPPED[@]}"

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo
  echo "Surviving mutants:"
  printf '  %s\n' "${SURVIVORS[@]}"
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo
  echo "Skipped mutants:"
  printf '  %s\n' "${SKIPPED[@]}"
fi

if [ $FAILED -gt 0 ]; then
  echo
  echo "❌ $FAILED mutant(s) survived"
  exit 1
fi

echo
echo "✅ All mutants killed"
exit 0
