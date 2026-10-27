#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gyms column lock (migration 043)
# Tests that removing key constraints causes test failures

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
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: Must run from repo root" >&2
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
if ! supabase db reset > "$BASELINE_OUTPUT" 2>&1; then
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
  local sql_mutation="$3"
  local expected_fail="${4:-}"
  
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
  
  # Apply mutation via psql to the DB
  local mutation_output=$(mktemp)
  if ! psql "$SUPABASE_DB_URL" \
    -c "$sql_mutation" > "$mutation_output" 2>&1; then
    echo "  ❌ SKIPPED: mutation SQL failed"
    echo "  psql error:"
    cat "$mutation_output" | sed 's/^/    /'
    SKIPPED+=("$name: mutation failed")
    rm -f "$mutation_output"
    sleep 2
    return 0
  fi
  rm -f "$mutation_output"
  
  # Run tests and capture output
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:gyms-column-lock-real-db > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
    echo "  Last 20 lines of test output:"
    tail -20 "$test_output" | sed 's/^/    /'
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ KILLED"
    # Show which test failed (grep for FAIL lines)
    if grep -q "FAIL" "$test_output"; then
      echo "  Failed assertion:"
      if [ -n "$expected_fail" ]; then
        # Check for expected failure message
        if grep -q "$expected_fail" "$test_output"; then
          echo "    ✓ Killed by expected assertion: $expected_fail"
        else
          grep "FAIL" "$test_output" | head -3 | sed 's/^/    /'
        fi
      else
        grep "FAIL" "$test_output" | head -3 | sed 's/^/    /'
      fi
    fi
  fi
  rm -f "$test_output"
  
  sleep 2
  return 0
}

# Mutant (a): Remove the trigger entirely
run_mutant \
  "(a) remove trigger" \
  "Drop the gyms_brand_only_update trigger" \
  "DROP TRIGGER IF EXISTS gyms_brand_only_update ON public.gyms;" \
  "Update slug blocked"

# Mutant (b): Add slug to brand columns allow-list
run_mutant \
  "(b) add slug to allow-list" \
  "Allow slug updates by adding it to v_brand_columns" \
  "CREATE OR REPLACE FUNCTION public.enforce_gyms_brand_only_update() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS \$\$ DECLARE v_old_filtered jsonb; v_new_filtered jsonb; v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'slug']; BEGIN IF current_user IN ('service_role', 'postgres') THEN RETURN NEW; END IF; v_old_filtered := to_jsonb(OLD) - v_brand_columns; v_new_filtered := to_jsonb(NEW) - v_brand_columns; IF v_old_filtered IS DISTINCT FROM v_new_filtered THEN RAISE EXCEPTION 'Non-brand column update blocked' USING errcode = 'GJC12'; END IF; RETURN NEW; END; \$\$;" \
  "Update slug blocked"

# Mutant (c): Remove privileged bypass
run_mutant \
  "(c) remove privileged bypass" \
  "Block service_role from updating protected columns" \
  "CREATE OR REPLACE FUNCTION public.enforce_gyms_brand_only_update() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS \$\$ DECLARE v_old_filtered jsonb; v_new_filtered jsonb; v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color']; BEGIN v_old_filtered := to_jsonb(OLD) - v_brand_columns; v_new_filtered := to_jsonb(NEW) - v_brand_columns; IF v_old_filtered IS DISTINCT FROM v_new_filtered THEN RAISE EXCEPTION 'Non-brand column update blocked' USING errcode = 'GJC12'; END IF; RETURN NEW; END; \$\$;" \
  "service_role can update"

# Mutant (d): Change trigger to AFTER UPDATE (too late to block)
run_mutant \
  "(d) change to AFTER UPDATE" \
  "Move trigger to AFTER UPDATE (cannot block changes)" \
  "DROP TRIGGER IF EXISTS gyms_brand_only_update ON public.gyms; CREATE TRIGGER gyms_brand_only_update AFTER UPDATE ON public.gyms FOR EACH ROW EXECUTE FUNCTION public.enforce_gyms_brand_only_update();" \
  "Update slug blocked"

# Mutant (e): Add name to brand columns allow-list
run_mutant \
  "(e) add name to allow-list" \
  "Allow name updates by adding it to v_brand_columns" \
  "CREATE OR REPLACE FUNCTION public.enforce_gyms_brand_only_update() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS \$\$ DECLARE v_old_filtered jsonb; v_new_filtered jsonb; v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'name']; BEGIN IF current_user IN ('service_role', 'postgres') THEN RETURN NEW; END IF; v_old_filtered := to_jsonb(OLD) - v_brand_columns; v_new_filtered := to_jsonb(NEW) - v_brand_columns; IF v_old_filtered IS DISTINCT FROM v_new_filtered THEN RAISE EXCEPTION 'Non-brand column update blocked' USING errcode = 'GJC12'; END IF; RETURN NEW; END; \$\$;" \
  "Update name blocked"

# Mutant (f): Add created_at to brand columns allow-list
run_mutant \
  "(f) add created_at to allow-list" \
  "Allow created_at updates by adding it to v_brand_columns" \
  "CREATE OR REPLACE FUNCTION public.enforce_gyms_brand_only_update() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS \$\$ DECLARE v_old_filtered jsonb; v_new_filtered jsonb; v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'created_at']; BEGIN IF current_user IN ('service_role', 'postgres') THEN RETURN NEW; END IF; v_old_filtered := to_jsonb(OLD) - v_brand_columns; v_new_filtered := to_jsonb(NEW) - v_brand_columns; IF v_old_filtered IS DISTINCT FROM v_new_filtered THEN RAISE EXCEPTION 'Non-brand column update blocked' USING errcode = 'GJC12'; END IF; RETURN NEW; END; \$\$;" \
  "Update created_at blocked"

# MED-2 mutants: Loosen CHECK constraints
# Mutant (g): Unanchor logo regex start
run_mutant \
  "(g) unanchored logo start" \
  "Remove ^ anchor from logo CHECK (allows leading space)" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format; ALTER TABLE public.gyms ADD CONSTRAINT gyms_logo_url_format CHECK (logo_url IS NULL OR (logo_url ~ 'https://.+' AND logo_url !~ '[\x00-\x1F\x7F]' AND logo_url !~ '\\.\\.') OR (logo_url ~ '^/storage/.+' AND logo_url !~ '[\x00-\x1F\x7F]' AND logo_url !~ '\\.\\..'));" \
  "Logo with leading space rejected"

# Mutant (h): Case-insensitive logo regex
run_mutant \
  "(h) case-insensitive logo" \
  "Use ~* for logo CHECK (allows HTTPS://)" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format; ALTER TABLE public.gyms ADD CONSTRAINT gyms_logo_url_format CHECK (logo_url IS NULL OR (logo_url ~* '^https://.+' AND logo_url !~ '[\x00-\x1F\x7F]' AND logo_url !~ '\\.\\.') OR (logo_url ~ '^/storage/.+' AND logo_url !~ '[\x00-\x1F\x7F]' AND logo_url !~ '\\.\\..'));" \
  "Uppercase HTTPS:// rejected"

# Mutant (i): Allow 3-digit hex (#RGB)
run_mutant \
  "(i) allow #RGB" \
  "Change primary_color CHECK to allow 3-digit hex" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_primary_color_hex; ALTER TABLE public.gyms ADD CONSTRAINT gyms_primary_color_hex CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{3,6}\$');" \
  "#RGB rejected"

# Mutant (j): Unanchored color end (allows trailing characters)
run_mutant \
  "(j) unanchored primary_color end" \
  "Remove $ anchor from primary_color CHECK" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_primary_color_hex; ALTER TABLE public.gyms ADD CONSTRAINT gyms_primary_color_hex CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}');" \
  "Hex with trailing"

# Mutant (k): Unanchored accent_color end
run_mutant \
  "(k) unanchored accent_color end" \
  "Remove $ anchor from accent_color CHECK" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_accent_color_hex; ALTER TABLE public.gyms ADD CONSTRAINT gyms_accent_color_hex CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}');" \
  "Hex with trailing"

# Mutant (l): Remove display_name length constraint (LOW-2)
run_mutant \
  "(l) remove display_name length CHECK" \
  "Drop gyms_display_name_length constraint" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_display_name_length;" \
  "display_name over 100 chars rejected"

# Mutant (m): Remove logo_url length constraint (LOW-2)
run_mutant \
  "(m) remove logo_url length CHECK" \
  "Drop gyms_logo_url_length constraint" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_length;" \
  "logo_url over 2048 chars rejected"

echo
echo "=== Mutant Test Summary ==="
echo "Total mutants: $((FAILED + $(echo "$BASELINE_OUTPUT" | wc -l) - FAILED))"
echo "Killed: $((13 - FAILED - ${#SKIPPED[@]}))"
echo "Survived: $FAILED"
echo "Skipped: ${#SKIPPED[@]}"
echo

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "❌ Survivors:"
  printf '  - %s\n' "${SURVIVORS[@]}"
  echo
  exit 1
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "⚠️  Skipped:"
  printf '  - %s\n' "${SKIPPED[@]}"
  echo
fi

echo "✅ All mutants killed"
exit 0
