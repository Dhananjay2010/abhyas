-- Gym/tenant data model (schema)
-- Multi-tenant: each gym is a separate organization that can own programs/sessions.
-- Members belong to gyms; the gym_id lives in gym_memberships, NOT in profiles.

-- ============================================================
-- ENUM
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'gym_role') then
    create type gym_role as enum ('owner', 'staff', 'member');
  end if;
end $$;

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists gyms (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null check (slug ~ '^[a-z0-9_-]+$'),
  name          text not null,
  timezone      text not null default 'Asia/Kolkata',
  created_at    timestamptz not null default now()
);

create table if not exists gym_memberships (
  gym_id      uuid not null references gyms(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        gym_role not null,
  status      text not null default 'active' check (status in ('active', 'removed')),
  joined_at   timestamptz not null default now(),
  primary key (gym_id, user_id)
);

-- 0 or 1 active owner per gym (partial unique index)
create unique index if not exists gym_memberships_one_active_owner_per_gym
  on gym_memberships (gym_id) 
  where (role = 'owner' and status = 'active');

-- At most one ACTIVE member-role membership per user (owner and staff can have multiple)
create unique index if not exists gym_memberships_one_active_member_per_user
  on gym_memberships (user_id)
  where (role = 'member' and status = 'active');

-- ============================================================
-- SECURITY DEFINER HELPER (avoids RLS recursion)
-- ============================================================

-- Check if the current user is staff or owner of a gym
create or replace function public.is_gym_staff(check_gym_id uuid)
returns boolean language sql security definer
set search_path = public
stable as $$
  select exists (
    select 1 
    from gym_memberships 
    where gym_id = check_gym_id
      and user_id = auth.uid()
      and role in ('owner', 'staff')
      and status = 'active'
  );
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
  revoke execute on function public.is_gym_staff(uuid) from public, anon;
  grant execute on function public.is_gym_staff(uuid) to authenticated;
exception when undefined_function then
  null;
end $$;

-- Check if the current user is the owner of a gym
create or replace function public.is_gym_owner(check_gym_id uuid)
returns boolean language sql security definer
set search_path = public
stable as $$
  select exists (
    select 1 
    from gym_memberships 
    where gym_id = check_gym_id
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
  );
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
  revoke execute on function public.is_gym_owner(uuid) from public, anon;
  grant execute on function public.is_gym_owner(uuid) to authenticated;
exception when undefined_function then
  null;
end $$;

-- Prevent owner from demoting or removing themselves
create or replace function public.prevent_owner_self_demotion()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- Block if trying to change own owner role
  if (old.role = 'owner' and old.status = 'active' and old.user_id = auth.uid()) then
    -- Changing role away from owner
    if (new.role != 'owner') then
      raise exception 'An owner cannot demote themselves. Transfer ownership to another user first.';
    end if;
    -- Changing status from active
    if (new.status != 'active') then
      raise exception 'An owner cannot deactivate themselves. Transfer ownership to another user first.';
    end if;
  end if;
  
  return new;
end;
$$;

-- Revoke all access (internal trigger function)
do $$
begin
  revoke execute on function public.prevent_owner_self_demotion() from public, anon, authenticated;
exception when undefined_function then
  null;
end $$;

-- Block owner from deleting their own owner row
create or replace function public.prevent_owner_self_deletion()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (old.role = 'owner' and old.status = 'active' and old.user_id = auth.uid()) then
    raise exception 'An owner cannot delete their own owner membership. Transfer ownership to another user first.';
  end if;
  
  return old;
end;
$$;

-- Revoke all access (internal trigger function)
do $$
begin
  revoke execute on function public.prevent_owner_self_deletion() from public, anon, authenticated;
exception when undefined_function then
  null;
end $$;

-- Apply triggers to gym_memberships
do $$
begin
  drop trigger if exists prevent_owner_self_demotion on gym_memberships;
  create trigger prevent_owner_self_demotion
    before update on gym_memberships
    for each row execute function public.prevent_owner_self_demotion();
  
  drop trigger if exists prevent_owner_self_deletion on gym_memberships;
  create trigger prevent_owner_self_deletion
    before delete on gym_memberships
    for each row execute function public.prevent_owner_self_deletion();
end $$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Enable RLS
alter table gyms enable row level security;
alter table gym_memberships enable row level security;

-- gyms: SELECT
-- Members see their own gym's row
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'gyms' 
      and policyname = 'gyms_member_select'
  ) then
    create policy gyms_member_select on gyms
      for select to authenticated
      using (
        exists (
          select 1 
          from gym_memberships 
          where gym_memberships.gym_id = gyms.id
            and gym_memberships.user_id = auth.uid()
            and gym_memberships.status = 'active'
        )
      );
  end if;
end $$;

-- gyms: UPDATE
-- Only the owner can update their gym
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'gyms' 
      and policyname = 'gyms_owner_update'
  ) then
    create policy gyms_owner_update on gyms
      for update to authenticated
      using (is_gym_owner(id))
      with check (is_gym_owner(id));
  end if;
end $$;

-- gym_memberships: SELECT (members see their own memberships)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'gym_memberships' 
      and policyname = 'gym_memberships_own_select'
  ) then
    create policy gym_memberships_own_select on gym_memberships
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- gym_memberships: SELECT (staff/owner see all memberships of their gym)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'gym_memberships' 
      and policyname = 'gym_memberships_staff_select'
  ) then
    create policy gym_memberships_staff_select on gym_memberships
      for select to authenticated
      using (is_gym_staff(gym_id));
  end if;
end $$;

-- gym_memberships: SELECT (members see their gym's row in gyms via the join)
-- Covered by gyms_member_select

-- gym_memberships: INSERT
-- Only owner can add staff or owner memberships (member memberships use RPC later)
-- No direct client INSERT of member role
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'gym_memberships' 
      and policyname = 'gym_memberships_owner_insert'
  ) then
    create policy gym_memberships_owner_insert on gym_memberships
      for insert to authenticated
      with check (
        role in ('owner', 'staff') and is_gym_owner(gym_id)
      );
  end if;
end $$;

-- gym_memberships: UPDATE
-- Only the owner can change status or role of staff
-- Members can't change their own membership
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'gym_memberships' 
      and policyname = 'gym_memberships_owner_update'
  ) then
    create policy gym_memberships_owner_update on gym_memberships
      for update to authenticated
      using (is_gym_owner(gym_id))
      with check (is_gym_owner(gym_id));
  end if;
end $$;

-- gym_memberships: DELETE
-- Only the owner can delete memberships
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'gym_memberships' 
      and policyname = 'gym_memberships_owner_delete'
  ) then
    create policy gym_memberships_owner_delete on gym_memberships
      for delete to authenticated
      using (is_gym_owner(gym_id));
  end if;
end $$;
