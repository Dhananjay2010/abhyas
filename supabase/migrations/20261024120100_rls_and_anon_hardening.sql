-- Security audit: RLS verification and anon privilege revocation
--
-- 1. Verify RLS enabled on all user tables (including breathe tables)
-- 2. Add missing RLS policies where needed
-- 3. P3-L1: Revoke all table privileges from anon on user-data tables
-- 4. Set default privileges to prevent future grants to anon
--
-- Idempotent: checks for existing policies/grants before adding.

-- ============================================================
-- 1. VERIFY RLS ON USER TABLES
-- ============================================================

-- These tables were added in breathe migrations; ensure RLS is enabled
alter table public.breathing_logs enable row level security;
alter table public.user_breathing_patterns enable row level security;
alter table public.user_journey_progress enable row level security;

-- ============================================================
-- 2. ADD MISSING RLS POLICIES (idempotent)
-- ============================================================

-- breathing_logs: policies already exist from 20260912090000_breathe_phase_one.sql
-- Check if any policy exists for this table; if not, something is wrong
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'breathing_logs'
  ) then
    raise notice 'WARNING: No policies found for breathing_logs, but they should exist from breathe_phase_one.sql';
  end if;
end $$;

-- user_breathing_patterns: policies already exist from 20260914090000_breathe_your_own.sql
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'user_breathing_patterns'
  ) then
    raise notice 'WARNING: No policies found for user_breathing_patterns, but they should exist from breathe_your_own.sql';
  end if;
end $$;

-- user_journey_progress: SELECT-only policy from 20260918090000_breathe_journey.sql
-- This table is read-only to clients (written only by advance_journey_day SECURITY DEFINER)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'user_journey_progress'
  ) then
    raise notice 'WARNING: No policies found for user_journey_progress, but they should exist from breathe_journey.sql';
  end if;
end $$;

-- ============================================================
-- 3. P3-L1: REVOKE ALL TABLE PRIVILEGES FROM ANON
-- ============================================================

-- User-data tables: revoke all from anon
-- List taken from main's migrations (all tables with user_id or id FK to auth.users)
do $$
declare
  user_table text;
begin
  foreach user_table in array array[
    'profiles',
    'user_settings',
    'user_equipment',
    'user_injuries',
    'programs',
    'program_days',
    'program_day_exercises',
    'sessions',
    'session_exercises',
    'session_sets',
    'exercise_progress',
    'body_metrics',
    'user_yoga_progress',
    'breathing_logs',
    'user_breathing_patterns',
    'user_journey_progress'
  ] loop
    -- Guard with to_regclass so partial database doesn't fail
    if to_regclass('public.' || user_table) is not null then
      execute format('revoke all on public.%I from anon', user_table);
    end if;
  end loop;
end $$;

-- Reference tables and views: check if logged-out pages need SELECT
-- Currently, the landing page is static and doesn't query the database,
-- so anon doesn't need SELECT on reference tables either.
-- Revoke for defense in depth.
do $$
declare
  ref_item text;
begin
  foreach ref_item in array array[
    'equipment',
    'exercises',
    'exercise_media',
    'exercise_substitutions',
    'warmup_exercises',
    'breathing_patterns',
    'breathing_routines',
    'breathing_journeys',
    'yoga_playlists',
    'yoga_videos',
    'exercise_strength_history',
    'session_volume'
  ] loop
    -- Guard with to_regclass so partial database doesn't fail
    if to_regclass('public.' || ref_item) is not null then
      execute format('revoke all on public.%I from anon', ref_item);
    end if;
  end loop;
end $$;

-- ============================================================
-- 4. DEFAULT PRIVILEGES: PREVENT FUTURE GRANTS TO ANON
-- ============================================================

-- Future tables created in public schema will not grant to anon by default
alter default privileges in schema public
  revoke all on tables from anon;

-- Future functions: revoke execute from anon only (NOT public, to avoid silently
-- removing authenticated access from all future RPCs)
alter default privileges in schema public
  revoke execute on functions from anon;

-- Grant to authenticated as needed (per-function, not blanket)
-- Note: specific function grants are handled in their respective migrations
