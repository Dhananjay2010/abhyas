-- Harden account deletion RPC
--
-- This migration hardens the delete_own_account() function created in 20261024000002:
-- 1. Clears search_path and uses fully qualified names
-- 2. Revokes default PUBLIC and anon grants
-- 3. Explicitly grants only to authenticated
--
-- Safe to run multiple times (idempotent).

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
begin
  -- Get the authenticated user's ID
  -- Must use fully qualified name since search_path is empty
  caller_id := (select auth.uid());
  
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete all user data (CASCADE handles child tables)
  -- Verified foreign key cascades (from initial_schema.sql and subsequent migrations):
  --
  -- From auth.users(id):
  --   - profiles(id) ON DELETE CASCADE
  --   - user_settings(user_id) ON DELETE CASCADE
  --   - user_equipment(user_id) ON DELETE CASCADE
  --   - user_injuries(user_id) ON DELETE CASCADE
  --   - programs(user_id) ON DELETE CASCADE
  --   - sessions(user_id) ON DELETE CASCADE
  --   - exercise_progress(user_id) ON DELETE CASCADE
  --   - body_metrics(user_id) ON DELETE CASCADE
  --   - user_yoga_progress(user_id) ON DELETE CASCADE
  --   - breathing_logs(user_id) ON DELETE CASCADE (from 20260912090000)
  --   - user_breathing_patterns(user_id) ON DELETE CASCADE (from 20260914090000)
  --   - user_journey_progress(user_id) ON DELETE CASCADE (from 20260918090000)
  --
  -- From programs(id):
  --   - program_days(program_id) ON DELETE CASCADE
  --
  -- From program_days(id):
  --   - program_day_exercises(program_day_id) ON DELETE CASCADE
  --
  -- From sessions(id):
  --   - session_exercises(session_id) ON DELETE CASCADE
  --   - breathing_logs(session_id) ON DELETE CASCADE
  --
  -- From session_exercises(id):
  --   - session_sets(session_exercise_id) ON DELETE CASCADE
  --
  -- No Supabase Storage buckets or files are used for user data (avatars come
  -- from Google OAuth metadata, not uploaded files).
  
  -- Delete the profiles row (keys on auth.users id with CASCADE)
  -- This is safe to do first because deleting auth.users would cascade to it anyway
  delete from public.profiles where id = caller_id;
  
  -- Delete the auth user (this is the only reason for SECURITY DEFINER)
  -- This cascades to any remaining user data
  delete from auth.users where id = caller_id;
  
  -- If we get here, deletion succeeded
  return;
end;
$$;

-- Revoke default PUBLIC grant and explicitly deny anon
-- Postgres grants EXECUTE on functions to PUBLIC by default
revoke all on function public.delete_own_account() from public, anon;

-- Grant execute only to authenticated users
grant execute on function public.delete_own_account() to authenticated;

-- Update comment
comment on function public.delete_own_account() is
  'Deletes the calling user''s account and all their data. '
  'Enforces that users can only delete their own account via auth.uid() check. '
  'SECURITY DEFINER with cleared search_path and fully qualified names. '
  'Execute permission revoked from public and anon, granted only to authenticated.';
