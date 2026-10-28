-- Pre-flight check for migration 043: brand column length constraints (LOW-2)
-- 
-- This read-only query verifies that no existing gyms rows violate the new
-- CHECK constraints on display_name and logo_url lengths before applying them.
--
-- Migration 043 adds:
--   - display_name: max 100 characters
--   - logo_url: max 2048 characters
--
-- Run this BEFORE applying migration 043 in production:
--   psql $DATABASE_URL -f supabase/preflight/043-length-constraints-check.sql
--
-- Expected result: No rows returned.
-- If any rows are returned, they must be fixed before the migration can be applied.

-- Check for display_name violations (over 100 characters)
SELECT 
  id,
  slug,
  'display_name' AS violated_column,
  char_length(display_name) AS current_length,
  100 AS max_allowed,
  display_name
FROM public.gyms
WHERE display_name IS NOT NULL 
  AND char_length(display_name) > 100;

-- Check for logo_url violations (over 2048 characters)
SELECT 
  id,
  slug,
  'logo_url' AS violated_column,
  char_length(logo_url) AS current_length,
  2048 AS max_allowed,
  left(logo_url, 100) || '...' AS logo_url_preview
FROM public.gyms
WHERE logo_url IS NOT NULL 
  AND char_length(logo_url) > 2048;

-- Summary
SELECT 
  'display_name violations' AS check_type,
  count(*) AS violation_count
FROM public.gyms
WHERE display_name IS NOT NULL 
  AND char_length(display_name) > 100
UNION ALL
SELECT 
  'logo_url violations' AS check_type,
  count(*) AS violation_count
FROM public.gyms
WHERE logo_url IS NOT NULL 
  AND char_length(logo_url) > 2048;
