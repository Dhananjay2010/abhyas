-- Guard delete_own_account against gym owners
--
-- Gym owners must transfer ownership before they can delete their account.
-- This migration adds a pre-check that raises a clear error if the caller
-- owns any gym, preventing the cascade deletion from reaching the trigger.

-- Helper function: check if user owns any gym and return gym name
create or replace function public.get_owned_gym_name(user_id_param uuid)
returns text
language sql
security definer
set search_path = ''
stable as $$
  select public.gyms.name
  from public.gym_memberships
  join public.gyms on public.gym_memberships.gym_id = public.gyms.id
  where public.gym_memberships.user_id = user_id_param
    and public.gym_memberships.role = 'owner'
    and public.gym_memberships.status = 'active'
  limit 1;
$$;

-- Revoke public access
do $$
begin
  revoke execute on function public.get_owned_gym_name(uuid) from public, anon;
  grant execute on function public.get_owned_gym_name(uuid) to authenticated;
exception when undefined_function then
  null;
end $$;

-- Update delete_own_account to check for gym ownership first
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  owned_gym_name text;
begin
  -- Get the authenticated user's ID
  caller_id := (select auth.uid());
  
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- PRE-CHECK: Block if user owns a gym
  owned_gym_name := public.get_owned_gym_name(caller_id);
  if owned_gym_name is not null then
    -- Use SQLSTATE 'OWN01' (custom state) so UI can recognize this error
    raise exception using
      message = format('You own %s. Transfer ownership before deleting your account.', owned_gym_name),
      errcode = 'OWN01';
  end if;

  -- Delete all user data (CASCADE handles child tables)
  -- The ON DELETE CASCADE constraints will clean up:
  --   - user_settings, user_equipment, user_injuries
  --   - programs, program_days, program_day_exercises
  --   - sessions, session_exercises, session_sets
  --   - exercise_progress, body_metrics, user_yoga_progress
  --   - breathing_logs (if exists)
  --   - gym_memberships (after ownership check passes)
  
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
  'Blocks deletion if the user owns a gym (raises SQLSTATE OWN01). '
  'Enforces that users can only delete their own account. '
  'This is a SECURITY DEFINER function because auth.users is not accessible to the authenticated role.';
