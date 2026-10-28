#!/usr/bin/env bash
set -uo pipefail

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
  echo "CI: Using default SUPABASE_DB_URL"
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
KILLED=0
TOTAL_MUTANTS=12

# Use main's reset pattern: plain only in CI with default URL
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
  local post_sql="${5:-}"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  local reset_output=$(mktemp)
  if ! eval "$RESET_CMD" > "$reset_output" 2>&1; then
    echo "  ❌ SKIP: db reset failed"
    SKIPPED+=("$name: db reset failed")
    FAILED=$((FAILED + 1))
    rm -f "$reset_output"
    return 1
  fi
  rm -f "$reset_output"
  
  # Build mutated SQL
  local mutated_file=$(mktemp)
  if ! eval "$sed_command '$MIGRATION_FILE'" > "$mutated_file"; then
    echo "  ❌ SKIP: sed command failed"
    SKIPPED+=("$name: sed failed")
    FAILED=$((FAILED + 1))
    rm -f "$mutated_file"
    return 1
  fi
  
  # Verify sed changed the file (skip if post_sql is set and sed is no-op)
  if [ -z "$post_sql" ] && cmp -s "$MIGRATION_FILE" "$mutated_file"; then
    echo "  ❌ SKIP: sed did not change the file (pattern not found)"
    SKIPPED+=("$name: sed pattern not found")
    FAILED=$((FAILED + 1))
    rm -f "$mutated_file"
    return 1
  fi
  
  # Apply mutated SQL
  local mutation_output=$(mktemp)
  if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f "$mutated_file" > "$mutation_output" 2>&1; then
    echo "  ❌ SKIP: mutation SQL failed"
    echo "  psql error:"
    cat "$mutation_output" | head -10 | sed 's/^/    /'
    SKIPPED+=("$name: mutation failed")
    FAILED=$((FAILED + 1))
    rm -f "$mutation_output" "$mutated_file"
    return 1
  fi
  rm -f "$mutation_output" "$mutated_file"

  # Apply optional post-mutation SQL
  if [ -n "$post_sql" ]; then
    local post_output=$(mktemp)
    if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -c "$post_sql" > "$post_output" 2>&1; then
      echo "  ❌ SKIP: post-mutation SQL failed"
      cat "$post_output" | head -5 | sed 's/^/    /'
      SKIPPED+=("$name: post-SQL failed")
      FAILED=$((FAILED + 1))
      rm -f "$post_output"
      return 1
    fi
    rm -f "$post_output"
  fi
  
  # Run tests and capture output
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:gym-branding-real-db > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
    echo "  Last 20 lines of test output:"
    tail -20 "$test_output" | sed 's/^/    /'
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
    rm -f "$test_output"
    return 1
  fi
  
  # Check for expected FAIL line
  if grep -qF "$expected_fail_line" "$test_output"; then
    echo "  ✅ KILLED by expected assertion"
    KILLED=$((KILLED + 1))
  else
    echo "  ❌ SKIP: killed but not by expected assertion"
    echo "  Expected: $expected_fail_line"
    echo "  FAIL lines found:"
    grep "FAIL" "$test_output" | head -5 | sed 's/^/    /' || echo "    (no FAIL lines)"
    SKIPPED+=("$name: wrong assertion")
    FAILED=$((FAILED + 1))
    rm -f "$test_output"
    return 1
  fi
  
  rm -f "$test_output"
  return 0
}

# Mutant (a): Remove owner check from set_gym_branding
run_mutant \
  "(a) remove owner check" \
  "Allow any authenticated user to update branding" \
  "sed '/if not public.is_gym_owner(/,/end if;/d' <" \
  "FAIL Member cannot call set_gym_branding"

# Mutant (b): Drop primary_color CHECK constraint
run_mutant \
  "(b) drop primary_color CHECK" \
  "Allow invalid primary_color values" \
  "sed '/alter table public.gyms add constraint gyms_primary_color_hex/,/;$/d' <" \
  "FAIL Invalid primary_color rejected"

# Mutant (c): Drop accent_color CHECK constraint
run_mutant \
  "(c) drop accent_color CHECK" \
  "Allow invalid accent_color values" \
  "sed '/alter table public.gyms add constraint gyms_accent_color_hex/,/;$/d' <" \
  "FAIL Invalid accent_color rejected"

# Mutant (d): Drop logo_url CHECK constraint
run_mutant \
  "(d) drop logo_url CHECK" \
  "Allow invalid logo_url values" \
  "sed '/alter table public.gyms add constraint gyms_logo_url_format/,/);$/d' <" \
  "FAIL javascript: logo_url rejected"

# Mutant (e): Make set_gym_branding SECURITY INVOKER
run_mutant \
  "(e) SECURITY INVOKER" \
  "Change SECURITY DEFINER to INVOKER (RLS blocks)" \
  "sed '/create or replace function public.set_gym_branding(/,/^\$\$;/s/security definer/security invoker/' <" \
  "FAIL set_gym_branding has prosecdef"

# Mutant (f): Remove search_path from set_gym_branding
run_mutant \
  "(f) remove search_path" \
  "Remove search_path='' (allows schema injection)" \
  "sed \"s/set search_path = ''//\" <" \
  "FAIL set_gym_branding has search_path=''"

# Mutant (g): Add anon grant to set_gym_branding
run_mutant \
  "(g) add anon grant" \
  "Allow anonymous users to call set_gym_branding" \
  "sed 's/grant execute on function public.set_gym_branding/grant execute on function public.set_gym_branding(uuid, text, text, text, text, text[]) to anon;\ngrant execute on function public.set_gym_branding/' <" \
  "FAIL Anon cannot call set_gym_branding"

# Mutant (h): Leak created_at from get_gym_brand
run_mutant \
  "(h) leak created_at" \
  "Return sensitive created_at field from get_gym_brand" \
  "perl -0pe 's/  accent_color text\n\) language sql/  accent_color text,\n  created_at timestamptz\n) language sql/; s/    g\.accent_color\n  from public\.gyms g/    g.accent_color,\n    g.created_at\n  from public.gyms g/' <" \
  "FAIL Only returns allowed fields"
run_mutant \
  "(i) disable RLS on gyms" \
  "Allow direct table access bypassing RLS" \
  ":" \
  "FAIL Member UPDATE affects 0 rows" \
  "alter table public.gyms disable row level security;"

# Mutant (j): Missing GRANT on get_gym_brand
run_mutant \
  "(j) missing GRANT on get_gym_brand" \
  "Recreate get_gym_brand without granting to anon/authenticated" \
  "sed 's/^grant execute on function public.get_gym_brand(uuid) to anon, authenticated;$/revoke execute on function public.get_gym_brand(uuid) from anon, authenticated;/' <" \
  "FAIL Anon can call get_gym_brand"
run_mutant \
  "(k) clear parameter ignored" \
# Mutant (k): Clear parameter ignored
run_mutant \
  "(k) clear parameter ignored" \
  "Ignore p_clear array in set_gym_branding (always coalesce)" \
  'sed "s/v_clear_\([a-z_]*\) := '"'"'\1'"'"' = any(p_clear);/v_clear_\1 := false;/" <' \
  "FAIL display_name cleared"

# Mutant (l): Cross-gym attack (replace WHERE id = p_gym_id with WHERE id IS NOT NULL)
run_mutant \
  "(l) cross-gym attack" \
  "Allow owner to update all gyms' branding (cross-tenant)" \
  "sed 's/^  where id = p_gym_id;$/  where id is not null;/' <" \
  "FAIL Other gym display_name unchanged"
  "FAIL Other gym display_name unchanged"

# Reset DB after last mutant
echo
echo "Resetting database after all mutants..."
RESET_OUTPUT=$(mktemp)
if ! eval "$RESET_CMD" > "$RESET_OUTPUT" 2>&1; then
  echo "⚠️  Warning: Final reset failed"
  cat "$RESET_OUTPUT"
fi
rm -f "$RESET_OUTPUT"

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
