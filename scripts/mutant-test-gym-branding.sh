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

# Mutant (j): Cross-gym attack (MED-3a) - Replace WHERE id = p_gym_id with WHERE id IS NOT NULL
# Uses the real migration body with only the WHERE clause changed
# This mutant is killed only if the cross-tenant "Other gym" assertion fails
echo "Testing mutant: (j) cross-gym attack: replace WHERE id = p_gym_id with WHERE id IS NOT NULL"
echo "  Allow owner to update all gyms' branding (cross-tenant)"

# Reset database
j_reset_output=$(mktemp)
if ! supabase db reset > "$j_reset_output" 2>&1; then
  echo "  ❌ SKIPPED: db reset failed"
  SKIPPED+=("(j): db reset failed")
  rm -f "$j_reset_output"
  sleep 2
else
  rm -f "$j_reset_output"
  
  # Apply mutation - extract from migration and replace WHERE clause
  j_mutation_output=$(mktemp)
  j_sql=$(cat <<'EOSQL'
create or replace function public.set_gym_branding(
  p_gym_id uuid,
  p_display_name text default null,
  p_logo_url text default null,
  p_primary_color text default null,
  p_accent_color text default null,
  p_clear text[] default array[]::text[]
) returns json language plpgsql security definer
set search_path = '' as $$
declare
  v_updated_count int;
  v_field text;
  v_clear_display_name boolean := false;
  v_clear_logo_url boolean := false;
  v_clear_primary_color boolean := false;
  v_clear_accent_color boolean := false;
begin
  -- Check: caller must be the gym owner (BRND1)
  if not public.is_gym_owner(p_gym_id) then
    raise exception 'BRND1: Only the gym owner can update branding settings'
      using errcode = 'BRND1';
  end if;

  -- Validate clear field names and reject NULL elements (BRND6)
  if p_clear is not null then
    foreach v_field in array p_clear loop
      if v_field is null then
        raise exception 'BRND6: p_clear array cannot contain NULL elements'
          using errcode = 'BRND6';
      end if;
      if v_field not in ('display_name', 'logo_url', 'primary_color', 'accent_color') then
        raise exception 'BRND6: Invalid clear field name: %', v_field
          using errcode = 'BRND6';
      end if;
    end loop;
    
    -- Set clear flags
    v_clear_display_name := 'display_name' = any(p_clear);
    v_clear_logo_url := 'logo_url' = any(p_clear);
    v_clear_primary_color := 'primary_color' = any(p_clear);
    v_clear_accent_color := 'accent_color' = any(p_clear);
  end if;

  -- Validate display_name: reject blank/whitespace-only, enforce length (LOW-2)
  if p_display_name is not null then
    if char_length(btrim(p_display_name)) < 1 then
      raise exception 'Display name cannot be blank or whitespace-only'
        using errcode = '22023';
    end if;
    if char_length(p_display_name) > 100 then
      raise exception 'Display name cannot exceed 100 characters'
        using errcode = '22023';
    end if;
  end if;

  -- Validate primary_color if provided (BRND2)
  if p_primary_color is not null then
    if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'BRND2: primary_color must be exactly 6-digit hex code (e.g. #FF9A2E)'
        using errcode = 'BRND2';
    end if;
    if p_primary_color ~ 'var\(' then
      raise exception 'BRND2: primary_color cannot contain CSS var() functions'
        using errcode = 'BRND2';
    end if;
  end if;

  -- Validate accent_color if provided (BRND3)
  if p_accent_color is not null then
    if p_accent_color !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'BRND3: accent_color must be exactly 6-digit hex code (e.g. #E8850C)'
        using errcode = 'BRND3';
    end if;
    if p_accent_color ~ 'var\(' then
      raise exception 'BRND3: accent_color cannot contain CSS var() functions'
        using errcode = 'BRND3';
    end if;
  end if;

  -- Validate logo_url if provided (BRND4)
  if p_logo_url is not null then
    if char_length(p_logo_url) < 1 or char_length(btrim(p_logo_url)) < 1 then
      raise exception 'BRND4: logo_url cannot be blank or whitespace-only'
        using errcode = 'BRND4';
    end if;
    if char_length(p_logo_url) > 2048 then
      raise exception 'BRND4: logo_url cannot exceed 2048 characters'
        using errcode = 'BRND4';
    end if;
    if p_logo_url !~ '^https://.+' and p_logo_url !~ '^/storage/.+' then
      raise exception 'BRND4: logo_url must start with https:// or /storage/ and contain a path'
        using errcode = 'BRND4';
    end if;
    if p_logo_url ~ '[\x00-\x1F\x7F]' then
      raise exception 'BRND4: logo_url cannot contain control characters or newlines'
        using errcode = 'BRND4';
    end if;
    if p_logo_url ~ '\.\.' then
      raise exception 'BRND4: logo_url cannot contain path traversal sequences (..)'
        using errcode = 'BRND4';
    end if;
  end if;

  -- Enforce color pair rule: both or neither (BRND7)
  -- When clearing colors, both must be cleared together
  if v_clear_primary_color or v_clear_accent_color then
    if v_clear_primary_color <> v_clear_accent_color then
      raise exception 'BRND7: Both primary_color and accent_color must be cleared together'
        using errcode = 'BRND7';
    end if;
  end if;
  -- When setting colors, both must be provided together
  if (p_primary_color is not null or p_accent_color is not null) 
     and not v_clear_primary_color and not v_clear_accent_color then
    if p_primary_color is null or p_accent_color is null then
      raise exception 'BRND7: Both primary_color and accent_color must be set together'
        using errcode = 'BRND7';
    end if;
  end if;

  -- Update the gym (clear takes precedence over set)
  -- MUTANT: Changed from "where id = p_gym_id" to "where id is not null"
  update public.gyms
  set 
    display_name = case 
      when v_clear_display_name then null 
      else coalesce(p_display_name, display_name) 
    end,
    logo_url = case 
      when v_clear_logo_url then null 
      else coalesce(p_logo_url, logo_url) 
    end,
    primary_color = case 
      when v_clear_primary_color then null 
      else coalesce(p_primary_color, primary_color) 
    end,
    accent_color = case 
      when v_clear_accent_color then null 
      else coalesce(p_accent_color, accent_color) 
    end
  where id is not null;

  get diagnostics v_updated_count = row_count;

  -- If no rows updated, gym doesn't exist (BRND5)
  if v_updated_count = 0 then
    raise exception 'BRND5: Gym not found'
      using errcode = 'BRND5';
  end if;

  return json_build_object('success', true);
end;
$$;
EOSQL
)
  
  if ! psql "$SUPABASE_DB_URL" -c "$j_sql" > "$j_mutation_output" 2>&1; then
    echo "  ❌ SKIPPED: mutation SQL failed"
    echo "  psql error:"
    cat "$j_mutation_output" | sed 's/^/    /'
    SKIPPED+=("(j): mutation failed")
    rm -f "$j_mutation_output"
    sleep 2
  else
    rm -f "$j_mutation_output"
    
    # Run tests and capture full output
    j_test_output=$(mktemp)
    if REAL_DB=1 npm run test:gym-branding-real-db > "$j_test_output" 2>&1; then
      echo "  ❌ SURVIVED (tests passed when they should have failed)"
      echo "  Last 20 lines of test output:"
      tail -20 "$j_test_output" | sed 's/^/    /'
      SURVIVORS+=("(j)")
      FAILED=$((FAILED + 1))
    else
      # Check if it failed on cross-tenant "Other gym" assertion
      if grep -q "FAIL.*Other gym" "$j_test_output"; then
        echo "  ✅ KILLED"
        echo "  Failed assertion:"
        grep "FAIL.*Other gym" "$j_test_output" | head -5 | sed 's/^/    /'
      else
        echo "  ❌ SURVIVED (failed on validation but not cross-tenant isolation)"
        echo "  Failed assertions (no 'Other gym' failure found):"
        grep "FAIL" "$j_test_output" | head -5 | sed 's/^/    /'
        SURVIVORS+=("(j)")
        FAILED=$((FAILED + 1))
      fi
    fi
    rm -f "$j_test_output"
    sleep 2
  fi
fi

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   10"
echo "Killed:                          $((10 - FAILED - ${#SKIPPED[@]}))"
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
