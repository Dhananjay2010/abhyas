#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym branding RLS/RPC
# Tests that removing key constraints or RPC guards causes test failures

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
  local sql_mutation="$3"
  
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
  if REAL_DB=1 npm run test:gym-branding-real-db > "$test_output" 2>&1; then
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
      grep "FAIL" "$test_output" | head -3 | sed 's/^/    /'
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
  "create or replace function public.set_gym_branding(p_gym_id uuid, p_display_name text default null, p_logo_url text default null, p_primary_color text default null, p_accent_color text default null, p_clear text[] default array[]::text[]) returns json language plpgsql security definer set search_path = '' as \$\$ declare v_updated_count int; begin update public.gyms set display_name = coalesce(p_display_name, display_name), logo_url = coalesce(p_logo_url, logo_url), primary_color = coalesce(p_primary_color, primary_color), accent_color = coalesce(p_accent_color, accent_color) where id = p_gym_id; get diagnostics v_updated_count = row_count; if v_updated_count = 0 then raise exception 'BRND5: Gym not found' using errcode = 'BRND5'; end if; return json_build_object('success', true); end; \$\$;"

# Mutant (b): Add anon grant to set_gym_branding
run_mutant \
  "(b) add anon grant" \
  "Allow anonymous users to call set_gym_branding" \
  "grant execute on function public.set_gym_branding(uuid, text, text, text, text, text[]) to anon;"

# Mutant (c): Drop primary_color CHECK constraint
run_mutant \
  "(c) drop primary_color CHECK" \
  "Allow invalid primary_color values" \
  "alter table public.gyms drop constraint if exists gyms_primary_color_hex;"

# Mutant (d): Drop accent_color CHECK constraint
run_mutant \
  "(d) drop accent_color CHECK" \
  "Allow invalid accent_color values" \
  "alter table public.gyms drop constraint if exists gyms_accent_color_hex;"

# Mutant (e): Drop logo_url CHECK constraint
run_mutant \
  "(e) drop logo_url CHECK" \
  "Allow invalid logo_url values" \
  "alter table public.gyms drop constraint if exists gyms_logo_url_format;"

# Mutant (f): Add extra column to get_gym_brand return
run_mutant \
  "(f) leak created_at" \
  "Return sensitive created_at field from get_gym_brand" \
  "drop function if exists public.get_gym_brand(uuid); create function public.get_gym_brand(p_gym_id uuid) returns table (name text, slug text, timezone text, display_name text, logo_url text, primary_color text, accent_color text, created_at timestamptz) language sql security definer set search_path = '' stable as \$\$ select g.name, g.slug, g.timezone, g.display_name, g.logo_url, g.primary_color, g.accent_color, g.created_at from public.gyms g where g.id = p_gym_id limit 1; \$\$; revoke execute on function public.get_gym_brand(uuid) from public; grant execute on function public.get_gym_brand(uuid) to anon, authenticated;"

# Mutant (g): Disable RLS on gyms
run_mutant \
  "(g) disable RLS on gyms" \
  "Allow direct table access bypassing RLS" \
  "alter table public.gyms disable row level security;"

# Mutant (h): GRANT missing after get_gym_brand recreate
run_mutant \
  "(h) missing GRANT on get_gym_brand" \
  "Recreate get_gym_brand without granting to anon/authenticated" \
  "drop function if exists public.get_gym_brand(uuid); create function public.get_gym_brand(p_gym_id uuid) returns table (name text, slug text, timezone text, display_name text, logo_url text, primary_color text, accent_color text) language sql security definer set search_path = '' stable as \$\$ select g.name, g.slug, g.timezone, g.display_name, g.logo_url, g.primary_color, g.accent_color from public.gyms g where g.id = p_gym_id limit 1; \$\$; revoke execute on function public.get_gym_brand(uuid) from public, anon, authenticated;"

# Mutant (i): Clear parameter ignored
run_mutant \
  "(i) clear parameter ignored" \
  "Ignore p_clear array in set_gym_branding" \
  "create or replace function public.set_gym_branding(p_gym_id uuid, p_display_name text default null, p_logo_url text default null, p_primary_color text default null, p_accent_color text default null, p_clear text[] default array[]::text[]) returns json language plpgsql security definer set search_path = '' as \$\$ declare v_updated_count int; begin if not public.is_gym_owner(p_gym_id) then raise exception 'BRND1: Only the gym owner can update branding settings' using errcode = 'BRND1'; end if; if p_primary_color is not null and p_primary_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'BRND2: primary_color must be a 6-digit hex code (e.g. #FF9A2E)' using errcode = 'BRND2'; end if; if p_accent_color is not null and p_accent_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'BRND3: accent_color must be a 6-digit hex code (e.g. #E8850C)' using errcode = 'BRND3'; end if; if p_logo_url is not null and p_logo_url !~ '^https://' and p_logo_url !~ '^/storage/' then raise exception 'BRND4: logo_url must start with https:// or /storage/' using errcode = 'BRND4'; end if; update public.gyms set display_name = coalesce(p_display_name, display_name), logo_url = coalesce(p_logo_url, logo_url), primary_color = coalesce(p_primary_color, primary_color), accent_color = coalesce(p_accent_color, accent_color) where id = p_gym_id; get diagnostics v_updated_count = row_count; if v_updated_count = 0 then raise exception 'BRND5: Gym not found' using errcode = 'BRND5'; end if; return json_build_object('success', true); end; \$\$;"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   9"
echo "Killed:                          $((9 - FAILED - ${#SKIPPED[@]}))"
echo "Survived:                        $FAILED"
echo "Skipped:                         ${#SKIPPED[@]}"
echo "========================================="
echo

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "Survivors:"
  for s in "${SURVIVORS[@]}"; do
    echo "  - $s"
  done
  echo
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "Skipped:"
  for s in "${SKIPPED[@]}"; do
    echo "  - $s"
  done
  echo
fi

if [ $FAILED -gt 0 ]; then
  echo "❌ FAIL: $FAILED survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "❌ FAIL: 0 survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

echo "✅ All mutants killed"
exit 0
