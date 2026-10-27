-- Preflight check for migration 043: gyms column lock
-- Verifies the trigger and function exist and enforce the brand-only rule.
-- Also checks set_gym_branding is SECURITY DEFINER with correct search_path and owner.

\set ON_ERROR_STOP 1

-- Verify the trigger exists
SELECT EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgname = 'gyms_brand_only_update'
  AND tgrelid = 'public.gyms'::regclass
) AS trigger_exists \gset

\if :{trigger_exists}
  \echo '✓ Trigger gyms_brand_only_update exists'
\else
  \echo '✗ FAIL: Trigger gyms_brand_only_update not found'
  \q 1
\endif

-- Verify the function exists
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname = 'enforce_gyms_brand_only_update'
) AS function_exists \gset

\if :{function_exists}
  \echo '✓ Function enforce_gyms_brand_only_update exists'
\else
  \echo '✗ FAIL: Function enforce_gyms_brand_only_update not found'
  \q 1
\endif

-- Verify function contains expected logic (checks for both trigger and RPC after 043)
-- Widen regex to match: UPDATE (quoted or not), dynamic SQL, multi-line
SELECT COUNT(*) FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN ('enforce_gyms_brand_only_update', 'set_gym_branding')
AND pg_get_functiondef(p.oid) ~ 'to_jsonb\s*\(\s*(OLD|NEW)\s*\)\s*-\s*v_brand_columns'
AS expected_logic_count \gset

\if :{expected_logic_count} = 2
  \echo '✓ Both trigger function and set_gym_branding use expected jsonb comparison'
\else
  \echo '✗ FAIL: Expected logic not found in both functions'
  \q 1
\endif

-- Verify set_gym_branding is SECURITY DEFINER with search_path=''
SELECT 
  prosecdef AS is_security_definer,
  proconfig AS config,
  pg_get_userbyid(proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'set_gym_branding' \gset

\if :{is_security_definer}
  \echo '✓ set_gym_branding is SECURITY DEFINER'
\else
  \echo '✗ FAIL: set_gym_branding is not SECURITY DEFINER'
  \q 1
\endif

-- Check search_path is set to empty string
SELECT :'config' ~ 'search_path=""' AS has_empty_search_path \gset

\if :{has_empty_search_path}
  \echo '✓ set_gym_branding has search_path=""'
\else
  \echo '✗ FAIL: set_gym_branding does not have search_path=""'
  \q 1
\endif

-- Check owner is postgres
\if :owner = 'postgres'
  \echo '✓ set_gym_branding owner is postgres'
\else
  \echo '✗ FAIL: set_gym_branding owner is not postgres (got :owner)'
  \q 1
\endif

\echo '✓ All preflight checks passed for migration 043'
