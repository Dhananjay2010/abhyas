-- Gym backfill: create default gym and add existing users as members
-- Also adds an AFTER INSERT trigger on profiles to add new signups to the default gym.

-- ============================================================
-- CREATE DEFAULT GYM
-- ============================================================

-- Create the default gym (matching NEXT_PUBLIC_BRAND's default brand)
-- Leave owner unset; never hardcode any user id or email
insert into gyms (slug, name, timezone)
values ('default', 'Abhyas', 'Asia/Kolkata')
on conflict (slug) do nothing;

-- ============================================================
-- BACKFILL EXISTING USERS
-- ============================================================

-- Add every existing user as an active member of the default gym
do $$
declare
  default_gym_id uuid;
begin
  select id into default_gym_id from gyms where slug = 'default';
  
  if default_gym_id is null then
    raise exception 'Default gym not found';
  end if;
  
  insert into gym_memberships (gym_id, user_id, role, status, joined_at)
  select 
    default_gym_id,
    auth.users.id,
    'member',
    'active',
    coalesce(auth.users.created_at, now())
  from auth.users
  where not exists (
    select 1 
    from gym_memberships 
    where gym_memberships.user_id = auth.users.id
      and gym_memberships.gym_id = default_gym_id
  )
  on conflict (gym_id, user_id) do nothing;
end $$;

-- ============================================================
-- TRIGGER: Auto-add new signups to default gym
-- ============================================================

-- This trigger adds new signups to the default gym automatically.
-- It catches and logs its own errors so signup never fails if this fails.
create or replace function public.add_new_user_to_default_gym()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  default_gym_id uuid;
begin
  -- Find the default gym
  select id into default_gym_id from gyms where slug = 'default';
  
  if default_gym_id is null then
    -- Log error but don't fail signup
    raise warning 'Default gym not found, skipping gym membership for user %', new.id;
    return new;
  end if;
  
  -- Add the user to the default gym
  begin
    insert into gym_memberships (gym_id, user_id, role, status, joined_at)
    values (default_gym_id, new.id, 'member', 'active', now())
    on conflict (gym_id, user_id) do nothing;
  exception when others then
    -- Log error but don't fail signup
    raise warning 'Failed to add user % to default gym: %', new.id, sqlerrm;
  end;
  
  return new;
end;
$fn$;

-- Create the trigger if it doesn't exist
do $$
begin
  if not exists (
    select 1 from pg_trigger 
    where tgname = 'add_new_user_to_default_gym_trigger'
  ) then
    create trigger add_new_user_to_default_gym_trigger
      after insert on public.profiles
      for each row execute function public.add_new_user_to_default_gym();
  end if;
end $$;
