#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gyms column lock (migration 043)
# Tests that removing key constraints causes test failures
# Mutants (a-h, m-n) built by sed over 043; (i-k, o-r) undo 040 CHECKs after reset

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
  echo "CI: Using default SUPABASE_DB_URL"
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
KILLED=0
TOTAL_MUTANTS=18

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
  local undo_sql="${5:-}"
  
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
  
  # Apply mutation
  if [ -n "$undo_sql" ]; then
    # Undo SQL after reset (for removal/replacement mutants)
    local undo_output=$(mktemp)
    if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -c "$undo_sql" > "$undo_output" 2>&1; then
      echo "  ❌ SKIP: undo SQL failed"
      echo "  psql error:"
      cat "$undo_output" | sed 's/^/    /'
      SKIPPED+=("$name: undo failed")
      FAILED=$((FAILED + 1))
      rm -f "$undo_output"
      return 1
    fi
    rm -f "$undo_output"
  else
    # Build mutated migration with sed
    local mutated_migration=$(mktemp)
    if ! sed "$sed_pattern" "supabase/migrations/20261025000043_gyms_column_lock.sql" > "$mutated_migration"; then
      echo "  ❌ SKIP: sed command failed"
      SKIPPED+=("$name: sed failed")
      FAILED=$((FAILED + 1))
      rm -f "$mutated_migration"
      return 1
    fi
    
    # Verify sed changed something
    if cmp -s "supabase/migrations/20261025000043_gyms_column_lock.sql" "$mutated_migration"; then
      echo "  ❌ SKIP: sed produced no change (mutation ineffective)"
      SKIPPED+=("$name: no change")
      FAILED=$((FAILED + 1))
      rm -f "$mutated_migration"
      return 1
    fi
    
    # Apply mutated migration via psql
    local mutation_output=$(mktemp)
    if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f "$mutated_migration" > "$mutation_output" 2>&1; then
      echo "  ❌ SKIP: mutation SQL failed"
      echo "  psql error:"
      cat "$mutation_output" | sed 's/^/    /'
      SKIPPED+=("$name: mutation failed")
      FAILED=$((FAILED + 1))
      rm -f "$mutation_output" "$mutated_migration"
      return 1
    fi
    rm -f "$mutation_output" "$mutated_migration"
  fi
  
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
  
  # Check for expected failure message (test prints "FAIL <label>" with no colon)
  if grep -qF "$expected_fail" "$test_output"; then
    echo "  ✅ KILLED by expected assertion"
    KILLED=$((KILLED + 1))
  else
    echo "  ❌ SKIP: killed but not by expected assertion"
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
  "" \
  "FAIL Update slug blocked" \
  "DROP TRIGGER IF EXISTS gyms_brand_only_update ON public.gyms;"

# Mutant (b): Add slug to brand columns allow-list
run_mutant \
  "(b) add slug to allow-list" \
  "Allow slug updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'slug'];/" \
  "FAIL Update slug blocked"

# Mutant (c): Remove service_role from privileged bypass
run_mutant \
  "(c) drop service_role from bypass" \
  "Block service_role from updating protected columns" \
  "s/if current_user in ('service_role', 'postgres')/if current_user in ('postgres')/" \
  "FAIL service_role can update timezone"

# Mutant (d): Change current_user to session_user (different bypass check)
run_mutant \
  "(d) session_user instead of current_user" \
  "Use session_user instead of current_user for bypass" \
  "s/if current_user in ('service_role', 'postgres')/if session_user in ('service_role', 'postgres')/" \
  "FAIL service_role can update timezone"

# Mutant (e): Add name to brand columns allow-list
run_mutant \
  "(e) add name to allow-list" \
  "Allow name updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'name'];/" \
  "FAIL Update name blocked"

# Mutant (f): Add created_at to brand columns allow-list
run_mutant \
  "(f) add created_at to allow-list" \
  "Allow created_at updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'created_at'];/" \
  "FAIL Update created_at blocked"

# Mutant (g): Remove display_name length constraint
run_mutant \
  "(g) remove display_name length CHECK" \
  "Drop gyms_display_name_length constraint check" \
  "" \
  "FAIL display_name over 100 chars rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_display_name_length;"

# Mutant (h): Remove logo_url length constraint
run_mutant \
  "(h) remove logo_url length CHECK" \
  "Drop gyms_logo_url_length constraint check" \
  "" \
  "FAIL logo_url over 2048 chars rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_length;"

# Mutants (i-k, o-r): These CHECKs live in 040, so undo them after reset
# (i): Allow 3-digit hex (#RGB) in primary_color TABLE CHECK
run_mutant \
  "(i) allow #RGB in TABLE CHECK" \
  "Change gyms table primary_color CHECK to allow 3-digit hex (040 constraint)" \
  "" \
  "FAIL #RGB rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_primary_color_hex;
   ALTER TABLE public.gyms ADD CONSTRAINT gyms_primary_color_hex CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{3,6}\$');"

# (j): TABLE CHECK Unanchored primary_color end
run_mutant \
  "(j) unanchored primary_color end in TABLE CHECK" \
  "Remove \$ anchor from primary_color CHECK (040 constraint)" \
  "" \
  "FAIL Hex with trailing rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_primary_color_hex;
   ALTER TABLE public.gyms ADD CONSTRAINT gyms_primary_color_hex CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}');"

# (k): TABLE CHECK Unanchored accent_color end
run_mutant \
  "(k) unanchored accent_color end in TABLE CHECK" \
  "Remove \$ anchor from accent_color CHECK (040 constraint)" \
  "" \
  "FAIL Hex with trailing rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_accent_color_hex;
   ALTER TABLE public.gyms ADD CONSTRAINT gyms_accent_color_hex CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}');"

# Mutant (l): Drop postgres from bypass
run_mutant \
  "(l) drop postgres from bypass" \
  "Block postgres from updating protected columns" \
  "s/if current_user in ('service_role', 'postgres')/if current_user in ('service_role')/" \
  "FAIL postgres direct update works"

# Mutant (m): Compare only slug (ignores other non-brand changes)
run_mutant \
  "(m) compare only slug" \
  "Narrow comparison to only slug instead of all non-brand columns" \
  "s/v_old_filtered := to_jsonb(OLD) - v_brand_columns;/v_old_filtered := jsonb_build_object('slug', OLD.slug);/; s/v_new_filtered := to_jsonb(NEW) - v_brand_columns;/v_new_filtered := jsonb_build_object('slug', NEW.slug);/" \
  "FAIL Update name blocked"

# Mutant (n): Future column - add temp column AND change trigger to explicit column list
run_mutant \
  "(n) future column blocked" \
  "Add temp column and change trigger to explicit list (so future columns slip through)" \
  "1i-- Add temporary future column and change trigger to explicit list\nALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS temp_future_col text;\n\n; s/v_old_filtered := to_jsonb(OLD) - v_brand_columns;/v_old_filtered := jsonb_build_object('id', OLD.id, 'slug', OLD.slug, 'name', OLD.name, 'timezone', OLD.timezone, 'created_at', OLD.created_at);/; s/v_new_filtered := to_jsonb(NEW) - v_brand_columns;/v_new_filtered := jsonb_build_object('id', NEW.id, 'slug', NEW.slug, 'name', NEW.name, 'timezone', NEW.timezone, 'created_at', NEW.created_at);/" \
  "FAIL Future column update blocked"

# QA MED-2 mutants: Loosen 040 CHECK constraints
# Mutant (o): Unanchor logo regex start
run_mutant \
  "(o) unanchored logo start" \
  "Remove ^ anchor from logo CHECK (allows leading space, 040 constraint)" \
  "" \
  "FAIL Logo with leading space rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format;
   ALTER TABLE public.gyms ADD CONSTRAINT gyms_logo_url_format CHECK (
     logo_url IS NULL 
     OR (logo_url ~ 'https://.+' AND logo_url !~ E'[\\\\x00-\\\\x1F\\\\x7F]' AND logo_url !~ E'\\\\.\\\\.') 
     OR (logo_url ~ '/storage/.+' AND logo_url !~ E'[\\\\x00-\\\\x1F\\\\x7F]' AND logo_url !~ E'\\\\.\\\\.') 
   );"

# Mutant (p): Case-insensitive logo regex
run_mutant \
  "(p) case-insensitive logo" \
  "Use ~* for logo CHECK (allows HTTPS://, 040 constraint)" \
  "" \
  "FAIL Uppercase HTTPS:// rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format;
   ALTER TABLE public.gyms ADD CONSTRAINT gyms_logo_url_format CHECK (
     logo_url IS NULL 
     OR (logo_url ~* '^https://.+' AND logo_url !~ E'[\\\\x00-\\\\x1F\\\\x7F]' AND logo_url !~ E'\\\\.\\\\.') 
     OR (logo_url ~* '^/storage/.+' AND logo_url !~ E'[\\\\x00-\\\\x1F\\\\x7F]' AND logo_url !~ E'\\\\.\\\\.') 
   );"

# Mutant (q): Loosen path traversal check
run_mutant \
  "(q) loosen .. check" \
  "Remove .. path traversal check from logo (040 constraint)" \
  "" \
  "FAIL .. path traversal rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format;
   ALTER TABLE public.gyms ADD CONSTRAINT gyms_logo_url_format CHECK (
     logo_url IS NULL 
     OR (logo_url ~ '^https://.+' AND logo_url !~ E'[\\\\x00-\\\\x1F\\\\x7F]')
     OR (logo_url ~ '^/storage/.+' AND logo_url !~ E'[\\\\x00-\\\\x1F\\\\x7F]')
   );"

# Mutant (r): Remove control character check
run_mutant \
  "(r) allow control chars" \
  "Remove control character check from logo (040 constraint)" \
  "" \
  "FAIL Newline in logo rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format;
   ALTER TABLE public.gyms ADD CONSTRAINT gyms_logo_url_format CHECK (
     logo_url IS NULL 
     OR (logo_url ~ '^https://.+' AND logo_url !~ E'\\\\.\\\\.') 
     OR (logo_url ~ '^/storage/.+' AND logo_url !~ E'\\\\.\\\\.') 
   );"

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
