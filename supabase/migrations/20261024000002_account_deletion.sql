-- Account deletion RPC
--
-- A SECURITY DEFINER function that:
-- 1. Verifies the caller owns the account they're trying to delete
-- 2. Deletes all user data (cascades handle child tables)
-- 3. Deletes the auth.users row (which cascades to profiles)
--
-- Must run as SECURITY DEFINER because auth.users is not accessible to
-- the authenticated role. The function enforces that the caller can only
-- delete their own account.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
begin
  -- Get the authenticated user's ID
  caller_id := (select auth.uid());
  
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete all user data (CASCADE handles child tables)
  -- The ON DELETE CASCADE constraints will clean up:
  --   - user_settings, user_equipment, user_injuries
  --   - programs, program_days, program_day_exercises
  --   - sessions, session_exercises, session_sets
  --   - exercise_progress, body_metrics, user_yoga_progress
  --   - breathing_logs (if exists)
  
  -- Delete the profiles row (keys on auth.users id with CASCADE)
  delete from public.profiles where id = caller_id;
  
  -- Delete the auth user (this is the only reason for SECURITY DEFINER)
  -- This will cascade to profiles if it still exists
  delete from auth.users where id = caller_id;
  
  -- If we get here, deletion succeeded
  return;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.delete_own_account() to authenticated;

-- Add a comment explaining the function
comment on function public.delete_own_account() is
  'Deletes the calling user''s account and all their data. '
  'Enforces that users can only delete their own account. '
  'This is a SECURITY DEFINER function because auth.users is not accessible to the authenticated role.';
