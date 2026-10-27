#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym_domains and resolve_gym_by_host
# CI-only: runs as explicit step in database-seed-test job

echo "=== Mutant Testing: Gym Domains & Brand Resolution ==="
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
if ! check_db_reset_guard_bash check; then
  echo "❌ DB reset guard check failed:"
  check_db_reset_guard_bash explain
  exit 1
fi

# Default SUPABASE_DB_URL if not set (standard Supabase local stack)
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  echo "Using default SUPABASE_DB_URL: $SUPABASE_DB_URL"
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

TOTAL_MUTANTS=0
KILLED=0
SURVIVORS=()
SKIPPED=()

echo "Running baseline tests..."
baseline_output=$(mktemp)
if ! supabase db reset > /dev/null 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  exit 1
fi

if ! REAL_DB=1 npm run test:gym-domains-real-db > "$baseline_output" 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests." >&2
  echo "Error output:" >&2
  cat "$baseline_output" >&2
  rm -f "$baseline_output"
  exit 1
fi
rm -f "$baseline_output"
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
  
  # Apply mutation via psql to the same DB
  if ! psql "$SUPABASE_DB_URL" -c "$sql_mutation" > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: mutation SQL failed"
    SKIPPED+=("$name: mutation failed")
    return 0
  fi
  
  # Run tests and capture output
  local test_output
  if test_output=$(REAL_DB=1 npm run test:gym-domains-real-db 2>&1); then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
  else
    echo "  ✅ KILLED"
    KILLED=$((KILLED + 1))
  fi
  
  return 0
}

# Mutant (a): Drop verified filter
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

# Mutant (c): Drop RLS
run_mutant \
  "(c) drop RLS" \
  "Disable RLS on gym_domains table" \
  "ALTER TABLE public.gym_domains DISABLE ROW LEVEL SECURITY;"

# Mutant (d): Remove CASCADE
run_mutant \
  "(d) remove CASCADE" \
  "Remove ON DELETE CASCADE from gym_domains.gym_id" \
  "ALTER TABLE public.gym_domains DROP CONSTRAINT gym_domains_gym_id_fkey; 
   ALTER TABLE public.gym_domains ADD CONSTRAINT gym_domains_gym_id_fkey 
   FOREIGN KEY (gym_id) REFERENCES public.gyms(id);"

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

# Mutant (h): Leak private field
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

# Mutant (i): CHECK constraint removed
run_mutant \
  "(i) host format CHECK removed" \
  "Drop the host format CHECK constraint" \
  "ALTER TABLE public.gym_domains DROP CONSTRAINT gym_domains_host_format;"

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
