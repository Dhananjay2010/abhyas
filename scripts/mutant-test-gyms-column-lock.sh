#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gyms column lock (migration 043)
# Tests that removing key constraints causes test failures
# All mutants are built by sed over the real migration file

echo "=== Mutant Testing: Gyms Column Lock (Migration 043) ==="
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

# Check we're in the repo root
if [ ! -f "package.json" ] || [ ! -f "supabase/migrations/20261025000043_gyms_column_lock.sql" ]; then
  echo "❌ ERROR: Must run from repo root with migration 043 present" >&2
  exit 1
fi

# Test that Supabase is running
if ! supabase status &>/dev/null; then
  echo "❌ Supabase not running. Start it with: supabase start"
  exit 1
fi

FAILED=0
SURVIVORS=()
SKIPPED=()

echo "Running baseline tests..."
BASELINE_OUTPUT=$(mktemp)

# Use main's reset pattern: plain only in CI with default URL
if [ "${CI:-}" = "true" ] && [ "${SUPABASE_DB_URL:-}" = "postgresql://postgres:postgres@localhost:54322/postgres" ]; then
  RESET_CMD="supabase db reset"
else
  RESET_CMD="supabase db reset --db-url \"$SUPABASE_DB_URL\""
fi

if ! eval "$RESET_CMD" > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi

if ! REAL_DB=1 npm run test:gyms-column-lock-real-db > "$BASELINE_OUTPUT" 2>&1; then
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
  
  # Build mutated migration with sed
  local mutated_migration=$(mktemp)
  if ! sed "$sed_pattern" "supabase/migrations/20261025000043_gyms_column_lock.sql" > "$mutated_migration"; then
    echo "  ❌ FAIL: sed command failed"
    SKIPPED+=("$name: sed failed")
    FAILED=$((FAILED + 1))
    rm -f "$mutated_migration"
    return 1
  fi
  
  # Verify sed changed something
  if cmp -s "supabase/migrations/20261025000043_gyms_column_lock.sql" "$mutated_migration"; then
    echo "  ❌ FAIL: sed produced no change (mutation ineffective)"
    SKIPPED+=("$name: no change")
    FAILED=$((FAILED + 1))
    rm -f "$mutated_migration"
    return 1
  fi
  
  # Reset database
  local reset_output=$(mktemp)
  if ! eval "$RESET_CMD" > "$reset_output" 2>&1; then
    echo "  ❌ FAIL: db reset failed (skip doesn't exit 0)"
    SKIPPED+=("$name: db reset failed")
    FAILED=$((FAILED + 1))
    rm -f "$reset_output" "$mutated_migration"
    return 1
  fi
  rm -f "$reset_output"
  
  # Apply mutated migration via psql
  local mutation_output=$(mktemp)
  if ! psql "$SUPABASE_DB_URL" -f "$mutated_migration" > "$mutation_output" 2>&1; then
    echo "  ❌ FAIL: mutation SQL failed (skip doesn't exit 0)"
    echo "  psql error:"
    cat "$mutation_output" | sed 's/^/    /'
    SKIPPED+=("$name: mutation failed")
    FAILED=$((FAILED + 1))
    rm -f "$mutation_output" "$mutated_migration"
    return 1
  fi
  rm -f "$mutation_output" "$mutated_migration"
  
  # Run tests and capture output
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:gyms-column-lock-real-db > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
    echo "  Last 20 lines of test output:"
    tail -20 "$test_output" | sed 's/^/    /'
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
    rm -f "$test_output"
    return 1
  fi
  
  # Check for expected failure message
  if grep -qF "$expected_fail" "$test_output"; then
    echo "  ✅ KILLED by expected assertion: $expected_fail"
  else
    echo "  ❌ FAIL: killed but not by expected assertion"
    echo "  Expected: $expected_fail"
    echo "  Actual FAIL lines:"
    grep "FAIL" "$test_output" | head -3 | sed 's/^/    /' || echo "    (no FAIL lines found)"
    SKIPPED+=("$name: wrong assertion")
    FAILED=$((FAILED + 1))
    rm -f "$test_output"
    return 1
  fi
  
  rm -f "$test_output"
  return 0
}

# Mutant (a): Remove the trigger entirely
run_mutant \
  "(a) remove trigger" \
  "Drop the gyms_brand_only_update trigger" \
  '/^drop trigger if exists gyms_brand_only_update/,/^create trigger gyms_brand_only_update/d' \
  "FAIL: Update slug blocked"

# Mutant (b): Add slug to brand columns allow-list
run_mutant \
  "(b) add slug to allow-list" \
  "Allow slug updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'slug'];/" \
  "FAIL: Update slug blocked"

# Mutant (c): Remove service_role from privileged bypass
run_mutant \
  "(c) drop service_role from bypass" \
  "Block service_role from updating protected columns" \
  "s/if current_user in ('service_role', 'postgres')/if current_user in ('postgres')/" \
  "FAIL: service_role can update timezone"

# Mutant (d): Change current_user to session_user (different bypass check)
run_mutant \
  "(d) session_user instead of current_user" \
  "Use session_user instead of current_user for bypass" \
  "s/if current_user in ('service_role', 'postgres')/if session_user in ('service_role', 'postgres')/" \
  "FAIL: Update slug blocked"

# Mutant (e): Add name to brand columns allow-list
run_mutant \
  "(e) add name to allow-list" \
  "Allow name updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'name'];/" \
  "FAIL: Update name blocked"

# Mutant (f): Add created_at to brand columns allow-list
run_mutant \
  "(f) add created_at to allow-list" \
  "Allow created_at updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'created_at'];/" \
  "FAIL: Update created_at blocked"

# Mutant (g): Remove display_name length constraint
run_mutant \
  "(g) remove display_name length CHECK" \
  "Drop gyms_display_name_length constraint check" \
  '/gyms_display_name_length/,/end \$\$/d' \
  "FAIL: display_name over 100 chars rejected"

# Mutant (h): Remove logo_url length constraint
run_mutant \
  "(h) remove logo_url length CHECK" \
  "Drop gyms_logo_url_length constraint check" \
  '/gyms_logo_url_length/,/end \$\$/d' \
  "FAIL: logo_url over 2048 chars rejected"

# Mutant (i): Allow 3-digit hex (#RGB) in RPC
run_mutant \
  "(i) allow #RGB in set_gym_branding" \
  "Change primary_color validation to allow 3-digit hex" \
  "s/if p_primary_color !\~ '\^#\[0-9A-Fa-f\]{6}\$'/if p_primary_color !~ '^#[0-9A-Fa-f]{3,6}\$'/" \
  "FAIL: Set primary #RGB rejected"

# Mutant (j): Unanchored primary_color end in RPC
run_mutant \
  "(j) unanchored primary_color end" \
  "Remove $ anchor from primary_color validation" \
  "s/if p_primary_color !\~ '\^#\[0-9A-Fa-f\]{6}\$'/if p_primary_color !~ '^#[0-9A-Fa-f]{6}'/" \
  "FAIL: Hex with trailing rejected"

# Mutant (k): Unanchored accent_color end in RPC
run_mutant \
  "(k) unanchored accent_color end" \
  "Remove $ anchor from accent_color validation" \
  "s/if p_accent_color !\~ '\^#\[0-9A-Fa-f\]{6}\$'/if p_accent_color !~ '^#[0-9A-Fa-f]{6}'/" \
  "FAIL: Hex with trailing rejected"

# Mutant (l): Drop postgres from bypass
run_mutant \
  "(l) drop postgres from bypass" \
  "Block postgres from updating protected columns" \
  "s/if current_user in ('service_role', 'postgres')/if current_user in ('service_role')/" \
  "FAIL: postgres direct update works"

# Mutant (m): Compare only slug (ignores other non-brand changes)
run_mutant \
  "(m) compare only slug" \
  "Narrow comparison to only slug instead of all non-brand columns" \
  "s/v_old_filtered := to_jsonb(OLD) - v_brand_columns;/v_old_filtered := jsonb_build_object('slug', OLD.slug);/; s/v_new_filtered := to_jsonb(NEW) - v_brand_columns;/v_new_filtered := jsonb_build_object('slug', NEW.slug);/" \
  "FAIL: Update name blocked"

# Mutant (n): Add future column and block its update
run_mutant \
  "(n) future column blocked" \
  "Add a temp column and verify trigger blocks its update" \
  '1i-- Add temporary future column\nALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS temp_future_col text;\n' \
  "FAIL: Future column update blocked"

echo
echo "=== Mutant Test Summary ==="
TOTAL_MUTANTS=14
KILLED=$((TOTAL_MUTANTS - FAILED))
echo "Total mutants: $TOTAL_MUTANTS"
echo "Killed: $KILLED"
echo "Survived: ${#SURVIVORS[@]}"
echo "Skipped (failed to run): $((FAILED - ${#SURVIVORS[@]}))"
echo

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "❌ Survivors (tests passed when they should fail):"
  printf '  - %s\n' "${SURVIVORS[@]}"
  echo
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "❌ Skipped/Wrong assertion (mutant failed for wrong reason):"
  printf '  - %s\n' "${SKIPPED[@]}"
  echo
fi

if [ $FAILED -gt 0 ]; then
  echo "❌ FAIL: $FAILED mutants not properly killed"
  exit 1
fi

echo "✅ All $TOTAL_MUTANTS mutants killed with correct assertions"
exit 0
