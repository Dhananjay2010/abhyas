-- Performance improvements for gym_join_codes (Supabase advisor suggestions)
-- 1. Merge owner and staff SELECT policies into one permissive policy
-- 2. Add index on created_by (FK column)

-- ============================================================
-- POLICY OPTIMIZATION: Merge SELECT policies
-- ============================================================

-- Drop the old separate policies
do $$
begin
  drop policy if exists gym_join_codes_owner_select on public.gym_join_codes;
  drop policy if exists gym_join_codes_staff_select on public.gym_join_codes;
end $$;

-- Create the merged permissive policy
-- Allows: owner of the gym OR staff of the gym (staff can only see member codes)
-- Helper calls wrapped in (select ...) subqueries
do $$
begin
  drop policy if exists gym_join_codes_select on public.gym_join_codes;
  create policy gym_join_codes_select on public.gym_join_codes
    for select to authenticated
    using (
      (select public.is_gym_owner(gym_id)) or 
      ((select public.is_gym_staff(gym_id)) and role = 'member')
    );
end $$;

-- ============================================================
-- INDEX: Add index on created_by (FK column)
-- ============================================================

create index if not exists gym_join_codes_created_by_idx on public.gym_join_codes (created_by);

-- ============================================================
-- FUNCTION: Re-create redeem_join_code to return gym_name on already_member
-- ============================================================

create or replace function public.redeem_join_code(p_code text)
returns jsonb
language plpgsql security definer volatile
set search_path = '' as $$
declare
  v_code_record record;
  v_caller_id uuid;
  v_existing_membership record;
  v_is_read_only text;
  v_attempt_count int;
begin
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'GJC00';
  end if;

  -- Refuse read-only transactions (defense in depth against GET/HEAD)
  v_is_read_only := current_setting('transaction_read_only');
  if v_is_read_only = 'on' then
    raise exception 'Read-only access not permitted' using errcode = 'GJC11';
  end if;

  -- Check throttle BEFORE the lookup (don't reveal if code exists when over budget)
  select count(*) into v_attempt_count
  from public.gym_join_code_attempts
  where user_id = v_caller_id
    and attempted_at > now() - interval '15 minutes';
  
  if v_attempt_count >= 10 then
    -- Over budget: return throttled without revealing if code exists
    return jsonb_build_object('ok', false, 'reason', 'throttled');
  end if;

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
      -- Record miss and return invalid
      perform public.record_join_code_miss(v_caller_id);
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    when too_many_rows then
      -- Record miss and return invalid
      perform public.record_join_code_miss(v_caller_id);
      return jsonb_build_object('ok', false, 'reason', 'invalid');
  end;

  -- Validate not revoked
  if v_code_record.revoked_at is not null then
    perform public.record_join_code_miss(v_caller_id);
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;

  -- Validate not expired
  if v_code_record.expires_at is not null and v_code_record.expires_at <= now() then
    perform public.record_join_code_miss(v_caller_id);
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Validate not exhausted
  if v_code_record.max_uses is not null and v_code_record.use_count >= v_code_record.max_uses then
    perform public.record_join_code_miss(v_caller_id);
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  -- Check if user is already in this gym
  select * into v_existing_membership
  from public.gym_memberships
  where public.gym_memberships.gym_id = v_code_record.gym_id
    and public.gym_memberships.user_id = v_caller_id;

  -- If already active in the gym, handle based on role hierarchy (owner > staff > member)
  if v_existing_membership.gym_id is not null and v_existing_membership.status = 'active' then
    -- Owner redeeming any code for their own gym: no-op (no demotion, no error)
    if v_existing_membership.role = 'owner' then
      return jsonb_build_object('ok', false, 'reason', 'already_member', 'gym_name', v_code_record.gym_name);
    end if;
    
    -- Staff redeeming staff or member code: no-op (no demotion)
    if v_existing_membership.role = 'staff' then
      return jsonb_build_object('ok', false, 'reason', 'already_member', 'gym_name', v_code_record.gym_name);
    end if;
    
    -- Member redeeming staff code: UPGRADE to staff and consume one use
    if v_existing_membership.role = 'member' and v_code_record.role = 'staff' then
      -- Fall through to the membership update logic (will upgrade member → staff)
      null;
    else
      -- Member redeeming member code: no-op
      return jsonb_build_object('ok', false, 'reason', 'already_member', 'gym_name', v_code_record.gym_name);
    end if;
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

  -- Return success
  return jsonb_build_object('ok', true, 'gym_id', v_code_record.gym_id::text, 'gym_name', v_code_record.gym_name);
end;
$$;

-- Re-grant permissions
do $$
begin
  revoke execute on function public.redeem_join_code(text) from public, anon;
  grant execute on function public.redeem_join_code(text) to authenticated;
end $$;
