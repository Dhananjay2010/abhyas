#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym_domains and resolve_gym_by_host
# Tests that removing key constraints or permissions causes test failures
# Uses SQL commands applied after db reset (not sed on migration files)

echo "=== Mutant Testing: Gym Domains & Brand Resolution ==="
echo

# Skip if REAL_DB is not set (shard environments don't have Supabase)
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⏭️  Skipping mutant tests (REAL_DB=1 not set)"
  echo "   Set REAL_DB=1 to run these tests against a local Supabase instance"
  echo
  exit 0
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
if ! supabase db reset > /dev/null 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  exit 1
fi

if ! REAL_DB=1 npm run test:gym-domains-real-db > /dev/null 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests." >&2
  exit 1
fi
echo "✓ Baseline tests pass"

# Restart Supabase to ensure clean state for mutants
echo "Restarting Supabase for mutant tests..."
if ! supabase stop > /dev/null 2>&1; then
  echo "⚠️  Warning: supabase stop failed" >&2
fi
sleep 2
if ! supabase start > /dev/null 2>&1; then
  echo "❌ Failed to restart Supabase" >&2
  exit 1
fi
echo "✓ Supabase restarted"
echo

run_mutant() {
  local name="$1"
  local description="$2"
  local sql_mutation="$3"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  if ! supabase db reset > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: db reset failed"
    SKIPPED+=("$name: db reset failed")
    sleep 2
    return 0
  fi
  
  # Apply mutation via psql
  if ! psql "${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}" \
    -c "$sql_mutation" > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: mutation SQL failed"
    SKIPPED+=("$name: mutation failed")
    sleep 2
    return 0
  fi
  
  # Run tests
  if REAL_DB=1 npm run test:gym-domains-real-db > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ KILLED"
  fi
  
  sleep 2
  return 0
}

# Mutant (a): Drop verified filter in resolve_gym_by_host
run_mutant \
  "(a) drop verified filter" \
  "Remove the 'where verified = true' filter from resolve_gym_by_host" \
  "create or replace function public.resolve_gym_by_host(p_host text) returns table (gym_id uuid, gym_slug text, gym_name text) language sql security definer set search_path = '' stable as \$\$ with normalized as (select lower(regexp_replace(regexp_replace(trim(p_host), '\\\.\$', ''), ':[0-9]+\$', '')) as clean_host) select g.id as gym_id, g.slug as gym_slug, g.name as gym_name from normalized n join public.gym_domains d on d.host = n.clean_host join public.gyms g on g.id = d.gym_id limit 1; \$\$;"

# Mutant (b): Grant INSERT to authenticated
run_mutant \
  "(b) grant INSERT to authenticated" \
  "Allow authenticated users to insert gym_domains" \
  "create policy gym_domains_insert_authenticated on public.gym_domains for insert to authenticated with check (true);"

# Mutant (c): Drop RLS on gym_domains
run_mutant \
  "(c) drop RLS" \
  "Disable RLS on gym_domains table" \
  "alter table public.gym_domains disable row level security;"

# Mutant (d): Remove CASCADE on gym deletion
run_mutant \
  "(d) remove CASCADE" \
  "Remove ON DELETE CASCADE from gym_domains.gym_id" \
  "alter table public.gym_domains drop constraint gym_domains_gym_id_fkey; alter table public.gym_domains add constraint gym_domains_gym_id_fkey foreign key (gym_id) references public.gyms(id);"

# Note: Mutant (e) "remove lowercase constraint" is not tested because the format
# constraint regex (^[a-z0-9]...) already only allows lowercase letters, making
# the lowercase constraint redundant. The lowercase constraint is kept as
# defense-in-depth and clear intent, but removing it doesn't break functionality.

# Mutant (f): Remove anon grant from resolve_gym_by_host
run_mutant \
  "(f) remove anon grant" \
  "Revoke execute on resolve_gym_by_host from anon" \
  "revoke execute on function public.resolve_gym_by_host(text) from anon;"

# Mutant (g): Remove anon grant from get_gym_brand
run_mutant \
  "(g) remove anon grant from get_gym_brand" \
  "Revoke execute on get_gym_brand from anon" \
  "revoke execute on function public.get_gym_brand(uuid) from anon;"

# Mutant (h): Leak private field from get_gym_brand
run_mutant \
  "(h) leak private field" \
  "Add id column to get_gym_brand return" \
  "drop function if exists public.get_gym_brand(uuid); create function public.get_gym_brand(p_gym_id uuid) returns table (name text, slug text, timezone text, id uuid) language sql security definer set search_path = '' stable as \$\$ select g.name, g.slug, g.timezone, g.id from public.gyms g where g.id = p_gym_id limit 1; \$\$; grant execute on function public.get_gym_brand(uuid) to anon, authenticated;"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   7"
echo "Killed:                          $((7 - FAILED - ${#SKIPPED[@]}))"
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
