-- Migration 044: Operator-only gym provisioning RPC
-- Idempotent operator-only RPC for provisioning a gym with its owner and branding.
-- Security: SECURITY DEFINER with search_path="" owned by postgres, granted only to service_role.
-- Idempotency: Re-applying changes nothing; re-running with same slug updates branding and ensures owner membership.
-- Note: Migration 043 (#177, not merged yet) adds a gyms column-lock trigger bypassed for current_user in (service_role, postgres).
-- This SECURITY DEFINER function, owned by postgres, runs as postgres, so it bypasses the column-lock trigger.

-- ============================================================
-- FUNCTION: provision_gym
-- ============================================================

create or replace function public.provision_gym(
  p_name text,
  p_slug text,
  p_timezone text,
  p_owner_email text,
  p_display_name text default null,
  p_primary_color text default null,
  p_accent_color text default null,
  p_logo_url text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_existing_gym_id uuid;
  v_existing_membership record;
  v_new_gym_id uuid;
begin
  -- Validate p_name: non-blank, ≤100 chars
  if p_name is null or char_length(btrim(p_name)) < 1 then
    raise exception 'Gym name cannot be blank or whitespace-only'
      using errcode = '22023';  -- invalid_parameter_value
  end if;
  
  if char_length(p_name) > 100 then
    raise exception 'Gym name cannot exceed 100 characters'
      using errcode = '22023';
  end if;

  -- Validate p_slug: must match gyms table slug CHECK (slug ~ '^[a-z0-9_-]+$')
  if p_slug is null or char_length(btrim(p_slug)) < 1 then
    raise exception 'Gym slug cannot be blank or whitespace-only'
      using errcode = '22023';
  end if;
  
  if p_slug !~ '^[a-z0-9_-]+$' then
    raise exception 'Gym slug must contain only lowercase letters, numbers, hyphens, and underscores'
      using errcode = '22023';
  end if;

  -- Validate p_timezone: must exist in pg_timezone_names
  if p_timezone is null then
    raise exception 'Timezone cannot be null'
      using errcode = '22023';
  end if;
  
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone: %', p_timezone
      using errcode = '22023';
  end if;

  -- Validate branding params (same rules as set_gym_branding in migration 040)
  -- p_display_name: optional, but if provided must be non-blank and ≤100 chars
  if p_display_name is not null then
    if char_length(btrim(p_display_name)) < 1 then
      raise exception 'Display name cannot be blank or whitespace-only'
        using errcode = '22023';
    end if;
    if char_length(p_display_name) > 100 then
      raise exception 'Display name cannot exceed 100 characters'
        using errcode = '22023';
    end if;
  end if;

  -- Validate primary_color: must be NULL or exactly 6-digit hex code (#RRGGBB)
  if p_primary_color is not null then
    if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'Primary color must be exactly 6-digit hex code (e.g. #FF9A2E)'
        using errcode = 'BRND2';
    end if;
    if p_primary_color ~ 'var\(' then
      raise exception 'Primary color cannot contain CSS var() functions'
        using errcode = 'BRND2';
    end if;
  end if;

  -- Validate accent_color: must be NULL or exactly 6-digit hex code (#RRGGBB)
  if p_accent_color is not null then
    if p_accent_color !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'Accent color must be exactly 6-digit hex code (e.g. #E8850C)'
        using errcode = 'BRND3';
    end if;
    if p_accent_color ~ 'var\(' then
      raise exception 'Accent color cannot contain CSS var() functions'
        using errcode = 'BRND3';
    end if;
  end if;

  -- Color pair rule: both or neither (LOW-1: low-contrast primaries are allowed)
  if (p_primary_color is null and p_accent_color is not null) or 
     (p_primary_color is not null and p_accent_color is null) then
    raise exception 'Both primary_color and accent_color must be set together'
      using errcode = 'BRND7';
  end if;

  -- Validate logo_url: must be NULL or start with https:// or /storage/
  if p_logo_url is not null then
    if char_length(btrim(p_logo_url)) < 1 then
      raise exception 'Logo URL cannot be blank or whitespace-only'
        using errcode = 'BRND4';
    end if;
    if char_length(p_logo_url) > 2048 then
      raise exception 'Logo URL cannot exceed 2048 characters'
        using errcode = 'BRND4';
    end if;
    if p_logo_url !~ '^https://.+' and p_logo_url !~ '^/storage/.+' then
      raise exception 'Logo URL must start with https:// or /storage/ and contain a path'
        using errcode = 'BRND4';
    end if;
    if p_logo_url ~ '[\x00-\x1F\x7F]' then
      raise exception 'Logo URL cannot contain control characters or newlines'
        using errcode = 'BRND4';
    end if;
    if p_logo_url ~ '\.\.' then
      raise exception 'Logo URL cannot contain path traversal sequences (..)'
        using errcode = 'BRND4';
    end if;
  end if;

  -- Look up owner user by email
  select id into v_owner_id
  from auth.users
  where lower(email) = lower(p_owner_email);

  if v_owner_id is null then
    raise exception 'No user with that email. Ask them to sign up first.'
      using errcode = 'PGY01';
  end if;

  -- Check if gym with this slug already exists (idempotency)
  select id into v_existing_gym_id
  from public.gyms
  where slug = p_slug;

  if v_existing_gym_id is not null then
    -- Gym exists: check if trying to assign a different owner
    if exists (
      select 1
      from public.gym_memberships
      where gym_id = v_existing_gym_id
        and role = 'owner'
        and status = 'active'
        and user_id != v_owner_id
    ) then
      raise exception 'Gym slug already exists with a different owner'
        using errcode = 'PGY03';
    end if;

    -- Gym exists: update branding fields only if provided
    update public.gyms
    set
      display_name = coalesce(p_display_name, display_name),
      primary_color = coalesce(p_primary_color, primary_color),
      accent_color = coalesce(p_accent_color, accent_color),
      logo_url = coalesce(p_logo_url, logo_url)
    where id = v_existing_gym_id;

    -- Ensure owner membership exists and is active with role owner
    select * into v_existing_membership
    from public.gym_memberships
    where gym_id = v_existing_gym_id and user_id = v_owner_id;

    if v_existing_membership.gym_id is null then
      -- No membership exists: create owner membership
      -- For member-role membership conflicts, follow redeem_join_code pattern:
      -- deactivate any existing active member-role memberships in other gyms (owner/staff can have multiple)
      -- (This is an owner role, not member, so no need to deactivate other member memberships)
      insert into public.gym_memberships (gym_id, user_id, role, status, joined_at)
      values (v_existing_gym_id, v_owner_id, 'owner', 'active', now());
    elsif v_existing_membership.role != 'owner' or v_existing_membership.status != 'active' then
      -- Membership exists but wrong role or status: upgrade to owner and activate
      update public.gym_memberships
      set role = 'owner', status = 'active'
      where gym_id = v_existing_gym_id and user_id = v_owner_id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'created', false,
      'gym_id', v_existing_gym_id::text,
      'slug', p_slug
    );
  else
    -- Gym does not exist: insert new gym and owner membership
    insert into public.gyms (slug, name, timezone, display_name, primary_color, accent_color, logo_url)
    values (p_slug, p_name, p_timezone, p_display_name, p_primary_color, p_accent_color, p_logo_url)
    returning id into v_new_gym_id;

    -- Insert owner membership
    -- For member-role membership conflicts, follow redeem_join_code pattern:
    -- deactivate any existing active member-role memberships in other gyms (owner/staff can have multiple)
    -- (This is an owner role, not member, so no need to deactivate other member memberships)
    insert into public.gym_memberships (gym_id, user_id, role, status, joined_at)
    values (v_new_gym_id, v_owner_id, 'owner', 'active', now());

    return jsonb_build_object(
      'ok', true,
      'created', true,
      'gym_id', v_new_gym_id::text,
      'slug', p_slug
    );
  end if;
end;
$$;

-- Ensure function is owned by postgres
alter function public.provision_gym(text, text, text, text, text, text, text, text) owner to postgres;

-- Revoke from public, anon, authenticated; grant only to service_role
-- (postgres can call it from plain SQL; the coordinator runs it on prod through the Supabase connector as postgres)
do $$
begin
  revoke all on function public.provision_gym(text, text, text, text, text, text, text, text) from public, anon, authenticated;
  grant execute on function public.provision_gym(text, text, text, text, text, text, text, text) to service_role;
exception when undefined_function then
  null;
end $$;
