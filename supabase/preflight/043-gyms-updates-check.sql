-- Preflight check for migration 043: gyms column lock
-- Verifies pre-043 state: trigger and function should NOT exist yet.
-- Also checks set_gym_branding exists from 040 (SECURITY DEFINER, search_path='').

\set ON_ERROR_STOP 1

-- Verify the trigger does NOT exist yet (this is pre-043)
SELECT EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgname = 'gyms_brand_only_update'
  AND tgrelid = 'public.gyms'::regclass
) AS trigger_exists \gset

\if :trigger_exists
  \echo '✗ FAIL: Trigger gyms_brand_only_update already exists (043 already applied?)'
  SELECT 1/0 AS preflight_failed;
\else
  \echo '✓ Trigger gyms_brand_only_update does not exist yet (correct pre-043 state)'
\endif

-- Verify the function does NOT exist yet (this is pre-043)
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname = 'enforce_gyms_brand_only_update'
) AS function_exists \gset

\if :function_exists
  \echo '✗ FAIL: Function enforce_gyms_brand_only_update already exists (043 already applied?)'
  SELECT 1/0 AS preflight_failed;
\else
  \echo '✓ Function enforce_gyms_brand_only_update does not exist yet (correct pre-043 state)'
\endif

-- Verify set_gym_branding exists from 040 (should be present before 043)
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname = 'set_gym_branding'
) AS rpc_exists \gset

\if :rpc_exists
  \echo '✓ set_gym_branding exists (from 040)'
\else
  \echo '✗ FAIL: set_gym_branding does not exist (040 not applied?)'
  SELECT 1/0 AS preflight_failed;
\endif

-- Verify set_gym_branding is SECURITY DEFINER with search_path=''
SELECT 
  prosecdef AS is_security_definer,
  'search_path=""' = any(proconfig) AS has_empty_search_path,
  pg_get_userbyid(proowner) = 'postgres' AS owner_is_postgres
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'set_gym_branding' \gset

\if :is_security_definer
  \echo '✓ set_gym_branding is SECURITY DEFINER'
\else
  \echo '✗ FAIL: set_gym_branding is not SECURITY DEFINER'
  SELECT 1/0 AS preflight_failed;
\endif

\if :has_empty_search_path
  \echo '✓ set_gym_branding has search_path=""'
\else
  \echo '✗ FAIL: set_gym_branding does not have search_path=""'
  SELECT 1/0 AS preflight_failed;
\endif

\if :owner_is_postgres
  \echo '✓ set_gym_branding owner is postgres'
\else
  \echo '✗ FAIL: set_gym_branding owner is not postgres'
  SELECT 1/0 AS preflight_failed;
\endif

\echo '✅ All preflight checks passed for migration 043 (pre-043 state confirmed)'
