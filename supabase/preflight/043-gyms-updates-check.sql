-- Pre-flight check for migration 043: gyms column lock
-- 
-- This read-only query verifies that no existing code path updates non-brand
-- columns of public.gyms as an authenticated user (which would be blocked by
-- the new trigger).
--
-- Migration 043 adds a BEFORE UPDATE trigger that restricts authenticated users
-- to updating only brand columns: display_name, logo_url, primary_color, accent_color
--
-- Run this BEFORE applying migration 043 in production:
--   psql $DATABASE_URL -f supabase/preflight/043-gyms-updates-check.sql
--
-- Expected result: No functions or procedures found (empty result set).
-- If any functions are returned, review them to ensure they either:
--   1. Only update brand columns, OR
--   2. Are invoked by service_role/postgres (privileged), OR
--   3. Are safe to fail with GJC12 error

-- Find all stored functions/procedures that UPDATE public.gyms
SELECT 
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
  END AS volatility,
  CASE p.prosecdef
    WHEN true THEN 'DEFINER'
    ELSE 'INVOKER'
  END AS security,
  p.prosrc AS source
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE 
  n.nspname = 'public'
  AND (
    -- Look for UPDATE gyms in function source
    p.prosrc ~* 'UPDATE\s+public\.gyms'
    OR p.prosrc ~* 'UPDATE\s+gyms'
  )
ORDER BY p.proname;

-- Notes on expected results:
--
-- 1. set_gym_branding (migration 040):
--    - SECURITY DEFINER, updates brand columns only
--    - Safe: updates display_name, logo_url, primary_color, accent_color
--    - Called by authenticated users, but only modifies allowed columns
--
-- 2. Seed/migration functions:
--    - Any functions that INSERT or UPDATE gyms for setup purposes
--    - Safe if they run as service_role or postgres during migrations
--
-- If this query returns unexpected functions, investigate:
--   - Does it update id, slug, name, timezone, created_at, or future columns?
--   - Is it callable by authenticated users?
--   - Should it be refactored to use set_gym_branding or run as service_role?
