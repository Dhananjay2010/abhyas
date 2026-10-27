-- Gym join codes: invite codes for gyms
-- Owners can create codes for members and staff
-- Members redeem codes to join a gym (switches their single active membership)
-- Staff codes can only be created by owners

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists gym_join_codes (
    10|  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  code          text unique not null,
  role          gym_role not null check (role in ('member', 'staff')),
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  max_uses      int check (max_uses is null or max_uses > 0),
  use_count     int not null default 0 check (use_count >= 0),
  revoked_at    timestamptz
    20|);

-- Index for code lookups (case-insensitive)
create index if not exists gym_join_codes_code_upper_idx on gym_join_codes (upper(code));
create index if not exists gym_join_codes_gym_id_idx on gym_join_codes (gym_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Generate an 8-character code from an unambiguous alphabet
    30|-- (no 0/O, 1/I/l confusion)
create or replace function public.generate_join_code()
returns text language plpgsql security definer
set search_path = '' as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code_length int := 8;
  result text := '';
  i int;
    40|begin
  for i in 1..code_length loop
    result := result || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- Revoke all access (internal helper)
do $$
    50|begin
  revoke execute on function public.generate_join_code() from public, anon, authenticated;
exception when undefined_function then
  null;
end $$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

    60|alter table gym_join_codes enable row level security;

-- gym_join_codes: SELECT
-- Only the owner of that gym can select all codes
-- Staff can SELECT member codes only
do $$
begin
  drop policy if exists gym_join_codes_owner_select on gym_join_codes;
  create policy gym_join_codes_owner_select on gym_join_codes
    for select to authenticated
    70|    using (public.is_gym_owner(gym_id));
end $$;

do $$
begin
  drop policy if exists gym_join_codes_staff_select on gym_join_codes;
  create policy gym_join_codes_staff_select on gym_join_codes
    for select to authenticated
    using (public.is_gym_staff(gym_id) and role = 'member');
end $$;
    80|
-- gym_join_codes: INSERT
-- Only the owner can create codes (staff codes only by owner)
-- Staff can create member codes only (optional: if you want staff to create member codes)
do $$
begin
  drop policy if exists gym_join_codes_owner_insert on gym_join_codes;
  create policy gym_join_codes_owner_insert on gym_join_codes
    for insert to authenticated
    with check (public.is_gym_owner(gym_id));
    90|end $$;

-- gym_join_codes: UPDATE
-- Only the owner can revoke codes
do $$
begin
  drop policy if exists gym_join_codes_owner_update on gym_join_codes;
  create policy gym_join_codes_owner_update on gym_join_codes
    for update to authenticated
    using (public.is_gym_owner(gym_id))
   100|    with check (public.is_gym_owner(gym_id));
end $$;

-- ============================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================

-- Preview a join code: returns gym name, slug, and role only
-- No rows if invalid/expired/revoked/exhausted (no enumeration)
create or replace function public.preview_join_code(p_code text)
   110|returns table(gym_name text, gym_slug text, role gym_role)
language sql security definer
set search_path = ''
stable as $$
  select 
    public.gyms.name,
    public.gyms.slug,
    public.gym_join_codes.role
  from public.gym_join_codes
  join public.gyms on public.gym_join_codes.gym_id = public.gyms.id
   120|  where upper(public.gym_join_codes.code) = upper(p_code)
    and public.gym_join_codes.revoked_at is null
    and (public.gym_join_codes.expires_at is null or public.gym_join_codes.expires_at > now())
    and (public.gym_join_codes.max_uses is null or public.gym_join_codes.use_count < public.gym_join_codes.max_uses)
  limit 1;
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
   130|  revoke execute on function public.preview_join_code(text) from public, anon;
  grant execute on function public.preview_join_code(text) to authenticated;
exception when undefined_function then
  null;
end $$;

-- Redeem a join code: atomically validate and update memberships
-- For member role: user can have only ONE active member-role gym
-- For staff role: add or upgrade to staff in that gym
-- Returns gym_id and gym_name on success
   140|create or replace function public.redeem_join_code(p_code text)
returns table(gym_id uuid, gym_name text)
language plpgsql security definer
set search_path = '' as $$
declare
  v_code_record record;
  v_caller_id uuid;
  v_existing_membership record;
begin
  -- Get the authenticated user's ID
  v_caller_id := auth.uid();
   150|  
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the code row FOR UPDATE (prevents race on max_uses)
  select 
    public.gym_join_codes.id,
    public.gym_join_codes.gym_id,
    public.gym_join_codes.role,
    public.gym_join_codes.use_count,
   160|    public.gym_join_codes.max_uses,
    public.gym_join_codes.expires_at,
    public.gym_join_codes.revoked_at,
    public.gyms.name as gym_name
  into v_code_record
  from public.gym_join_codes
  join public.gyms on public.gym_join_codes.gym_id = public.gyms.id
  where upper(public.gym_join_codes.code) = upper(p_code)
  for update;

   170|  -- Validate the code exists
  if v_code_record.id is null then
    raise exception 'Invalid code';
  end if;

  -- Validate not revoked
  if v_code_record.revoked_at is not null then
    raise exception 'Invalid code';
  end if;

   180|  -- Validate not expired
  if v_code_record.expires_at is not null and v_code_record.expires_at <= now() then
    raise exception 'Invalid code';
  end if;

  -- Validate not exhausted
  if v_code_record.max_uses is not null and v_code_record.use_count >= v_code_record.max_uses then
    raise exception 'Invalid code';
  end if;

   190|  -- Check if user is already in this gym
  select * into v_existing_membership
  from public.gym_memberships
  where gym_id = v_code_record.gym_id
    and user_id = v_caller_id;

  -- If already in the gym with the same or higher role, it's an idempotent no-op
  if v_existing_membership.gym_id is not null then
    if v_existing_membership.status = 'active' then
      -- If already active with same role or higher (owner > staff > member), no-op
   200|      if (v_existing_membership.role = v_code_record.role) or
         (v_existing_membership.role = 'owner') or
         (v_existing_membership.role = 'staff' and v_code_record.role = 'member') then
        -- Idempotent no-op: already in the gym with sufficient role
        return query select v_code_record.gym_id, v_code_record.gym_name;
        return;
      end if;
    end if;
  end if;

   210|  -- For member role: deactivate any existing active member-role memberships in other gyms
  if v_code_record.role = 'member' then
    update public.gym_memberships
    set status = 'removed'
    where user_id = v_caller_id
      and role = 'member'
      and status = 'active'
      and gym_id != v_code_record.gym_id;
  end if;

   220|  -- Insert or reactivate the membership in the new gym
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
   230|      joined_at = case when status = 'removed' then now() else joined_at end
    where gym_id = v_code_record.gym_id
      and user_id = v_caller_id;
  end if;

  -- Increment use_count (consume a use)
  update public.gym_join_codes
  set use_count = use_count + 1
  where id = v_code_record.id;

   240|  -- Return gym_id and gym_name
  return query select v_code_record.gym_id, v_code_record.gym_name;
end;
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
  revoke execute on function public.redeem_join_code(text) from public, anon;
  grant execute on function public.redeem_join_code(text) to authenticated;
   250|exception when undefined_function then
  null;
end $$;

-- Create a join code (owner-only for both member and staff codes)
create or replace function public.create_join_code(
  p_gym_id uuid,
  p_role gym_role,
  p_expires_at timestamptz default null,
  p_max_uses int default null
   260|)
returns table(id uuid, code text)
language plpgsql security definer
set search_path = '' as $$
declare
  v_caller_id uuid;
  v_new_code text;
  v_new_id uuid;
  v_attempts int := 0;
  v_max_attempts int := 10;
   270|begin
  -- Get the authenticated user's ID
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Check that caller is the owner of the gym
  if not public.is_gym_owner(p_gym_id) then
   280|    raise exception 'Only gym owners can create join codes';
  end if;

  -- Validate role is member or staff
  if p_role not in ('member', 'staff') then
    raise exception 'Role must be member or staff';
  end if;

  -- Generate a unique code (retry up to 10 times on collision)
  loop
   290|    v_new_code := public.generate_join_code();
    v_new_id := gen_random_uuid();

    begin
      insert into public.gym_join_codes (
        id,
        gym_id,
        code,
        role,
        created_by,
        created_at,
   300|        expires_at,
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
   310|        now(),
        p_expires_at,
        p_max_uses,
        0,
        null
      );

      -- Success, exit loop
      exit;
    exception when unique_violation then
   320|      v_attempts := v_attempts + 1;
      if v_attempts >= v_max_attempts then
        raise exception 'Failed to generate unique code after % attempts', v_max_attempts;
      end if;
      -- Continue loop to retry
    end;
  end loop;

  -- Return the new code
  return query select v_new_id, v_new_code;
   330|end;
$$;

-- Revoke public access and grant only to authenticated users
do $$
begin
  revoke execute on function public.create_join_code(uuid, gym_role, timestamptz, int) from public, anon;
  grant execute on function public.create_join_code(uuid, gym_role, timestamptz, int) to authenticated;
exception when undefined_function then
  null;
   340|end $$;

-- Revoke a join code (owner-only)
create or replace function public.revoke_join_code(p_id uuid)
returns void
language plpgsql security definer
set search_path = '' as $$
declare
  v_caller_id uuid;
  v_gym_id uuid;
   350|begin
  -- Get the authenticated user's ID
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Get the gym_id for this code
  select gym_id into v_gym_id
   360|  from public.gym_join_codes
  where id = p_id;

  if v_gym_id is null then
    raise exception 'Code not found';
  end if;

  -- Check that caller is the owner of the gym
  if not public.is_gym_owner(v_gym_id) then
    raise exception 'Only gym owners can revoke join codes';
   370|  end if;

  -- Revoke the code
  update public.gym_join_codes
  set revoked_at = now()
  where id = p_id;
end;
$$;

-- Revoke public access and grant only to authenticated users
do $$
   380|begin
  revoke execute on function public.revoke_join_code(uuid) from public, anon;
  grant execute on function public.revoke_join_code(uuid) to authenticated;
exception when undefined_function then
  null;
end $$;
