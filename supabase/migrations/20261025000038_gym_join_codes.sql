-- Gym join codes: invite codes for gyms
-- Owners can create codes for members and staff
-- Members redeem codes to join a gym (switches their single active membership)
-- Staff codes can only be created by owners

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.gym_join_codes (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  code          text not null,
  role          public.gym_role not null check (role in ('member', 'staff')),
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  max_uses      int check (max_uses is null or max_uses > 0),
  use_count     int not null default 0 check (use_count >= 0),
  revoked_at    timestamptz,
  constraint code_format check (code ~ '^[2-9A-HJ-NP-Z]{10}$')
);

-- Unique index on upper(code) to prevent case-insensitive duplicates
create unique index if not exists gym_join_codes_code_upper_unique_idx on public.gym_join_codes (upper(code));
create index if not exists gym_join_codes_gym_id_idx on public.gym_join_codes (gym_id);

-- Throttle table: track failed redeem/preview attempts (misses only)
create table if not exists public.gym_join_code_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists gym_join_code_attempts_user_attempted_idx on public.gym_join_code_attempts (user_id, attempted_at);

alter table public.gym_join_code_attempts enable row level security;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Generate a 10-character code from an unambiguous alphabet using crypto
-- (no 0/O, 1/I/L confusion)
create or replace function public.generate_join_code()
returns text language plpgsql security definer
set search_path = '' as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  alphabet_len int := 32;
  code_length int := 10;
  result text := '';
  random_bytes bytea;
  i int;
  byte_val int;
begin
  random_bytes := extensions.gen_random_bytes(code_length);
  
  for i in 0..code_length - 1 loop
    byte_val := get_byte(random_bytes, i);
    result := result || substr(alphabet, (byte_val % alphabet_len) + 1, 1);
  end loop;
  
  return result;
end;
$$;

-- Revoke all access (internal helper, called only by other definer functions)
do $$
begin
  revoke execute on function public.generate_join_code() from public, anon, authenticated;
end $$;

grant execute on function public.generate_join_code() to postgres, service_role;

-- Check throttle: raise if user has >10 misses in last 15 minutes
create or replace function public.check_join_code_throttle(p_user_id uuid)
returns void language plpgsql security definer
set search_path = '' as $$
declare
  v_attempt_count int;
begin
  select count(*) into v_attempt_count
  from public.gym_join_code_attempts
  where user_id = p_user_id
    and attempted_at > now() - interval '15 minutes';
  
  if v_attempt_count >= 10 then
    raise exception 'Too many failed attempts. Please try again later.' using errcode = 'P0001';
  end if;
end;
$$;

-- Revoke all access
do $$
begin
  revoke execute on function public.check_join_code_throttle(uuid) from public, anon, authenticated;
end $$;

grant execute on function public.check_join_code_throttle(uuid) to postgres, service_role;

-- Record a failed attempt
create or replace function public.record_join_code_miss(p_user_id uuid)
returns void language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.gym_join_code_attempts (user_id, attempted_at)
  values (p_user_id, now());
end;
$$;

-- Revoke all access
do $$
begin
  revoke execute on function public.record_join_code_miss(uuid) from public, anon, authenticated;
end $$;

grant execute on function public.record_join_code_miss(uuid) to postgres, service_role;

-- ============================================================
-- RLS POLICIES
-- ============================================================

alter table public.gym_join_codes enable row level security;

-- gym_join_codes: SELECT
-- Only the owner of that gym can select all codes
-- Staff can SELECT member codes only
do $$
begin
  drop policy if exists gym_join_codes_owner_select on public.gym_join_codes;
  create policy gym_join_codes_owner_select on public.gym_join_codes
    for select to authenticated
    using (public.is_gym_owner(gym_id));
end $$;

do $$
begin
  drop policy if exists gym_join_codes_staff_select on public.gym_join_codes;
  create policy gym_join_codes_staff_select on public.gym_join_codes
    for select to authenticated
    using (public.is_gym_staff(gym_id) and role = 'member');
end $$;

-- gym_join_codes: INSERT
-- Only the owner can create codes (staff codes only by owner)
-- Staff can create member codes only (optional: if you want staff to create member codes)
do $$
begin
  drop policy if exists gym_join_codes_owner_insert on public.gym_join_codes;
  create policy gym_join_codes_owner_insert on public.gym_join_codes
    for insert to authenticated
    with check (public.is_gym_owner(gym_id));
end $$;

-- gym_join_codes: UPDATE
-- Only the owner can revoke codes
do $$
begin
  drop policy if exists gym_join_codes_owner_update on public.gym_join_codes;
  create policy gym_join_codes_owner_update on public.gym_join_codes
    for update to authenticated
    using (public.is_gym_owner(gym_id))
    with check (public.is_gym_owner(gym_id));
end $$;

-- ============================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================

-- Preview a join code: returns gym name, slug, and role only
-- No rows if invalid/expired/revoked/exhausted (no enumeration)
create or replace function public.preview_join_code(p_code text)
returns table(gym_name text, gym_slug text, role public.gym_role)
language plpgsql security definer
set search_path = '' as $$
declare
  v_caller_id uuid;
  v_result record;
begin
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'PAUTH';
  end if;
  
  -- Check throttle before proceeding
  perform public.check_join_code_throttle(v_caller_id);
  
  begin
    select 
      public.gyms.name,
      public.gyms.slug,
      public.gym_join_codes.role
    into strict v_result
    from public.gym_join_codes
    join public.gyms on public.gym_join_codes.gym_id = public.gyms.id
    where upper(public.gym_join_codes.code) = upper(p_code)
      and public.gym_join_codes.revoked_at is null
      and (public.gym_join_codes.expires_at is null or public.gym_join_codes.expires_at > now())
      and (public.gym_join_codes.max_uses is null or public.gym_join_codes.use_count < public.gym_join_codes.max_uses)
    limit 1;
    
    return query select v_result.name, v_result.slug, v_result.role;
  exception
    when no_data_found then
      -- Record miss and return empty
      perform public.record_join_code_miss(v_caller_id);
      return;
    when too_many_rows then
      -- Should not happen with limit 1, but handle it
      perform public.record_join_code_miss(v_caller_id);
      return;
  end;
end;
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
  revoke execute on function public.preview_join_code(text) from public, anon;
  grant execute on function public.preview_join_code(text) to authenticated;
end $$;

-- Redeem a join code: atomically validate and update memberships
-- For member role: user can have only ONE active member-role gym
-- For staff role: add or upgrade to staff in that gym
-- Returns gym_id and gym_name on success
create or replace function public.redeem_join_code(p_code text)
returns table(gym_id uuid, gym_name text)
language plpgsql security definer
set search_path = '' as $$
declare
  v_code_record record;
  v_caller_id uuid;
  v_existing_membership record;
begin
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'PAUTH';
  end if;

  -- Check throttle before proceeding
  perform public.check_join_code_throttle(v_caller_id);

  -- Lock the code row FOR UPDATE (prevents race on max_uses)
  begin
    select 
      public.gym_join_codes.id,
      public.gym_join_codes.gym_id,
      public.gym_join_codes.role,
      public.gym_join_codes.use_count,
      public.gym_join_codes.max_uses,
      public.gym_join_codes.expires_at,
      public.gym_join_codes.revoked_at,
      public.gyms.name as gym_name
    into strict v_code_record
    from public.gym_join_codes
    join public.gyms on public.gym_join_codes.gym_id = public.gyms.id
    where upper(public.gym_join_codes.code) = upper(p_code)
    for update;
  exception
    when no_data_found then
      perform public.record_join_code_miss(v_caller_id);
      raise exception 'Invalid code' using errcode = 'PCODE';
    when too_many_rows then
      perform public.record_join_code_miss(v_caller_id);
      raise exception 'Invalid code' using errcode = 'PCODE';
  end;

  -- Validate not revoked
  if v_code_record.revoked_at is not null then
    perform public.record_join_code_miss(v_caller_id);
    raise exception 'Invalid code' using errcode = 'PCODE';
  end if;

  -- Validate not expired
  if v_code_record.expires_at is not null and v_code_record.expires_at <= now() then
    perform public.record_join_code_miss(v_caller_id);
    raise exception 'Invalid code' using errcode = 'PCODE';
  end if;

  -- Validate not exhausted
  if v_code_record.max_uses is not null and v_code_record.use_count >= v_code_record.max_uses then
    perform public.record_join_code_miss(v_caller_id);
    raise exception 'Invalid code' using errcode = 'PCODE';
  end if;

  -- Check if user is already in this gym (any active role counts)
  select * into v_existing_membership
  from public.gym_memberships
  where public.gym_memberships.gym_id = v_code_record.gym_id
    and public.gym_memberships.user_id = v_caller_id;

  -- If already active in the gym with ANY role, it's an idempotent no-op
  -- (owner, staff, or member - never downgrade, never consume a use)
  if v_existing_membership.gym_id is not null and v_existing_membership.status = 'active' then
    -- Idempotent no-op: already in the gym, don't increment use_count
    return query select v_code_record.gym_id, v_code_record.gym_name;
    return;
  end if;

  -- For member role: deactivate any existing active member-role memberships in other gyms
  if v_code_record.role = 'member' then
    update public.gym_memberships
    set status = 'removed'
    where public.gym_memberships.user_id = v_caller_id
      and public.gym_memberships.role = 'member'
      and public.gym_memberships.status = 'active'
      and public.gym_memberships.gym_id != v_code_record.gym_id;
  end if;

  -- Insert or reactivate the membership in the new gym
  if v_existing_membership.gym_id is null then
    -- Insert new membership
    insert into public.gym_memberships (gym_id, user_id, role, status, joined_at)
    values (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now());
  else
    -- Reactivate or upgrade existing membership
    update public.gym_memberships
    set 
      role = v_code_record.role,
      status = 'active',
      joined_at = case when public.gym_memberships.status = 'removed' then now() else public.gym_memberships.joined_at end
    where public.gym_memberships.gym_id = v_code_record.gym_id
      and public.gym_memberships.user_id = v_caller_id;
  end if;

  -- Increment use_count (consume a use)
  update public.gym_join_codes
  set use_count = use_count + 1
  where id = v_code_record.id;

  -- Return gym_id and gym_name
  return query select v_code_record.gym_id, v_code_record.gym_name;
end;
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
  revoke execute on function public.redeem_join_code(text) from public, anon;
  grant execute on function public.redeem_join_code(text) to authenticated;
end $$;

-- Create a join code (owner-only for both member and staff codes)
create or replace function public.create_join_code(
  p_gym_id uuid,
  p_role public.gym_role,
  p_expires_at timestamptz default null,
  p_max_uses int default null
)
returns table(id uuid, code text)
language plpgsql security definer
set search_path = '' as $$
declare
  v_caller_id uuid;
  v_new_code text;
  v_new_id uuid;
  v_attempts int := 0;
  v_max_attempts int := 10;
begin
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'PAUTH';
  end if;

  -- Check that caller is the owner of the gym
  if not public.is_gym_owner(p_gym_id) then
    raise exception 'Only gym owners can create join codes' using errcode = 'POWNER';
  end if;

  -- Validate role is member or staff
  if p_role not in ('member', 'staff') then
    raise exception 'Role must be member or staff' using errcode = 'PROLE';
  end if;

  -- Validate expiry is in the future if provided
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiry must be in the future' using errcode = 'PEXPIRY';
  end if;

  -- Validate max_uses is at least 1 if provided
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'Max uses must be at least 1' using errcode = 'PMAXUSE';
  end if;

  -- Generate a unique code (retry up to 10 times on collision)
  loop
    v_new_code := public.generate_join_code();
    v_new_id := gen_random_uuid();

    begin
      insert into public.gym_join_codes (
        id,
        gym_id,
        code,
        role,
        created_by,
        created_at,
        expires_at,
        max_uses,
        use_count,
        revoked_at
      )
      values (
        v_new_id,
        p_gym_id,
        v_new_code,
        p_role,
        v_caller_id,
        now(),
        p_expires_at,
        p_max_uses,
        0,
        null
      );

      -- Success, exit loop
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= v_max_attempts then
        raise exception 'Failed to generate unique code after % attempts' using errcode = 'PCOLLIDE';
      end if;
      -- Continue loop to retry
    end;
  end loop;

  -- Return the new code
  return query select v_new_id, v_new_code;
end;
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
  revoke execute on function public.create_join_code(uuid, public.gym_role, timestamptz, int) from public, anon;
  grant execute on function public.create_join_code(uuid, public.gym_role, timestamptz, int) to authenticated;
end $$;

-- Revoke a join code (owner-only)
create or replace function public.revoke_join_code(p_id uuid)
returns void
language plpgsql security definer
set search_path = '' as $$
declare
  v_caller_id uuid;
  v_gym_id uuid;
begin
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'PAUTH';
  end if;

  -- Get the gym_id for this code
  begin
    select gym_id into strict v_gym_id
    from public.gym_join_codes
    where id = p_id;
  exception
    when no_data_found then
      raise exception 'Code not found' using errcode = 'PNOTFND';
    when too_many_rows then
      raise exception 'Code not found' using errcode = 'PNOTFND';
  end;

  -- Check that caller is the owner of the gym
  if not public.is_gym_owner(v_gym_id) then
    raise exception 'Only gym owners can revoke join codes' using errcode = 'POWNER';
  end if;

  -- Revoke the code
  update public.gym_join_codes
  set revoked_at = now()
  where id = p_id;
end;
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
  revoke execute on function public.revoke_join_code(uuid) from public, anon;
  grant execute on function public.revoke_join_code(uuid) to authenticated;
end $$;

-- ============================================================
-- SUPABASE ADVISOR FIXES (idempotent policy updates)
-- ============================================================
-- These fix Supabase advisor warnings from migrations 034-036:
-- (1) Wrap auth.uid() in subquery to avoid optimization issues
-- (2) Merge permissive SELECT policies on gym_memberships into one

-- Fix gyms_member_select: wrap auth.uid() in subquery
do $$
begin
  drop policy if exists gyms_member_select on public.gyms;
  create policy gyms_member_select on public.gyms
    for select to authenticated
    using (
      exists (
        select 1 
        from public.gym_memberships 
        where gym_memberships.gym_id = gyms.id
          and gym_memberships.user_id = (select auth.uid())
          and gym_memberships.status = 'active'
      )
    );
end $$;

-- Merge gym_memberships SELECT policies into one
-- Old: gym_memberships_own_select (user_id = auth.uid()) + gym_memberships_staff_select (is_gym_staff)
-- New: one policy allowing both conditions (OR semantics)
do $$
begin
  drop policy if exists gym_memberships_own_select on public.gym_memberships;
  drop policy if exists gym_memberships_staff_select on public.gym_memberships;
  create policy gym_memberships_select on public.gym_memberships
    for select to authenticated
    using (user_id = (select auth.uid()) or public.is_gym_staff(gym_id));
end $$;
