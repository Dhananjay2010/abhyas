#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym_domains and resolve_gym_by_host
# Tests that removing key constraints or permissions causes test failures
# Uses SQL commands applied after db reset (not sed on migration files)
# CI-only: runs as explicit step in database-seed-test job, not in npm test chain

echo "=== Mutant Testing: Gym Domains & Brand Resolution ==="
echo

# Skip if REAL_DB is not set (shard environments don't have Supabase)
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⏭️  Skipping mutant tests (REAL_DB=1 not set)"
  echo "   Set REAL_DB=1 to run these tests against a local Supabase instance"
  echo
  exit 0
fi

# DB reset guard: refuse unless CI=true OR ALLOW_DB_RESET=1 + non-default config
if [ "${CI:-}" != "true" ]; then
  if [ "${ALLOW_DB_RESET:-}" != "1" ]; then
    echo "❌ This script runs 'supabase db reset' which destroys local data."
    echo "   Run in CI, or set ALLOW_DB_RESET=1 with a non-default project/port."
    exit 1
  fi
  
  # Check for non-default project id or DB port
  project_id=$(grep '^project_id' supabase/config.toml 2>/dev/null | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "Fitness")
  db_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"
  
  # Extract port from DB URL (default is 54322)
  db_port=$(echo "$db_url" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
  
  if [ "$project_id" = "Fitness" ] && [ "$db_port" = "54322" ]; then
    echo "❌ ALLOW_DB_RESET=1 requires a non-default project id or DB port."
    echo "   Current: project_id='$project_id', db_port='$db_port'"
    echo "   Change project_id in supabase/config.toml or set SUPABASE_DB_URL."
    exit 1
  fi
  
  echo "✓ ALLOW_DB_RESET=1 with non-default config (project_id='$project_id', db_port='$db_port')"
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

TOTAL_MUTANTS=0
KILLED=0
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
echo

run_mutant() {
  local name="$1"
  local description="$2"
  local sql_mutation="$3"
  
  TOTAL_MUTANTS=$((TOTAL_MUTANTS + 1))
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  if ! supabase db reset > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: db reset failed"
    SKIPPED+=("$name: db reset failed")
    return 0
  fi
  
  # Apply mutation via psql
  if ! psql "${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}" \
    -c "$sql_mutation" > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: mutation SQL failed"
    SKIPPED+=("$name: mutation failed")
    return 0
  fi
  
  # Run tests and capture output
  local test_output
  if test_output=$(REAL_DB=1 npm run test:gym-domains-real-db 2>&1); then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
    # Print first failing check from test output
    echo "  Failed check output:"
    echo "$test_output" | grep -E "FAIL|ERROR" | head -5 | sed 's/^/    /'
  else
    echo "  ✅ KILLED"
    KILLED=$((KILLED + 1))
  fi
  
  return 0
}

# Mutant (a): Drop verified filter in resolve_gym_by_host
# Fixed SQL escaping: use $$ delimiters and properly escape single quotes
run_mutant \
  "(a) drop verified filter" \
  "Remove the 'where verified = true' filter from resolve_gym_by_host" \
  "CREATE OR REPLACE FUNCTION public.resolve_gym_by_host(p_host text) 
   RETURNS TABLE (gym_id uuid, gym_slug text, gym_name text) 
   LANGUAGE sql SECURITY DEFINER 
   SET search_path = ''
   STABLE AS \$\$
     WITH normalized AS (
       SELECT lower(
         regexp_replace(
           regexp_replace(trim(p_host), '\\.\$', ''),
           ':[0-9]+\$', ''
         )
       ) AS clean_host
     )
     SELECT g.id AS gym_id, g.slug AS gym_slug, g.name AS gym_name
     FROM normalized n
     JOIN public.gym_domains d ON d.host = n.clean_host
     JOIN public.gyms g ON g.id = d.gym_id
     LIMIT 1;
   \$\$;"

# Mutant (b): Grant INSERT to authenticated
run_mutant \
  "(b) grant INSERT to authenticated" \
  "Allow authenticated users to insert gym_domains" \
  "CREATE POLICY gym_domains_insert_authenticated ON public.gym_domains FOR INSERT TO authenticated WITH CHECK (true);"

# Mutant (c): Drop RLS on gym_domains
run_mutant \
  "(c) drop RLS" \
  "Disable RLS on gym_domains table" \
  "ALTER TABLE public.gym_domains DISABLE ROW LEVEL SECURITY;"

# Mutant (d): Remove CASCADE on gym deletion
run_mutant \
  "(d) remove CASCADE" \
  "Remove ON DELETE CASCADE from gym_domains.gym_id" \
  "ALTER TABLE public.gym_domains DROP CONSTRAINT gym_domains_gym_id_fkey; 
   ALTER TABLE public.gym_domains ADD CONSTRAINT gym_domains_gym_id_fkey 
   FOREIGN KEY (gym_id) REFERENCES public.gyms(id);"

# Note: Mutant (e) "remove lowercase constraint" was removed because the format
# constraint regex (^[a-z0-9]...) already only allows lowercase letters, making
# the lowercase constraint redundant. The lowercase constraint is kept as
# defense-in-depth and clear intent, but removing it doesn't break functionality.

# Mutant (f): Remove anon grant from resolve_gym_by_host
run_mutant \
  "(f) remove anon grant" \
  "Revoke execute on resolve_gym_by_host from anon" \
  "REVOKE EXECUTE ON FUNCTION public.resolve_gym_by_host(text) FROM anon;"

# Mutant (g): Remove anon grant from get_gym_brand
run_mutant \
  "(g) remove anon grant from get_gym_brand" \
  "Revoke execute on get_gym_brand from anon" \
  "REVOKE EXECUTE ON FUNCTION public.get_gym_brand(uuid) FROM anon;"

# Mutant (h): Leak private field from get_gym_brand
run_mutant \
  "(h) leak private field" \
  "Add id column to get_gym_brand return" \
  "DROP FUNCTION IF EXISTS public.get_gym_brand(uuid); 
   CREATE FUNCTION public.get_gym_brand(p_gym_id uuid) 
   RETURNS TABLE (name text, slug text, timezone text, id uuid) 
   LANGUAGE sql SECURITY DEFINER 
   SET search_path = ''
   STABLE AS \$\$
     SELECT g.name, g.slug, g.timezone, g.id 
     FROM public.gyms g 
     WHERE g.id = p_gym_id 
     LIMIT 1;
   \$\$; 
   GRANT EXECUTE ON FUNCTION public.get_gym_brand(uuid) TO anon, authenticated;"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   $TOTAL_MUTANTS"
echo "Killed:                          $KILLED"
echo "Survived:                        ${#SURVIVORS[@]}"
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

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "❌ FAIL: ${#SURVIVORS[@]} survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "❌ FAIL: 0 survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

echo "✅ All $TOTAL_MUTANTS mutants killed"
exit 0
