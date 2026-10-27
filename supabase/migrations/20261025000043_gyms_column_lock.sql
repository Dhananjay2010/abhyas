-- Gyms column lock: brand-only updates for non-privileged callers
-- Protects gym identity columns (id, slug, name, timezone, created_at) from tampering.
-- Only service_role and postgres can update non-brand columns.
-- Authenticated users (via RLS) can only update brand columns: display_name, logo_url, primary_color, accent_color.

-- ============================================================
-- TABLE CHECK CONSTRAINTS: Length caps for brand columns (LOW-2)
-- ============================================================

-- Add length constraints to brand columns (idempotent)
-- These mirror the RPC validations in set_gym_branding (migration 040)
-- and prevent storage of oversized values via direct owner UPDATE (gyms_owner_update policy, migration 034).

-- display_name: max 100 characters (enforces RPC's char_length check)
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'gyms_display_name_length' 
      and conrelid = 'public.gyms'::regclass
  ) then
    alter table public.gyms add constraint gyms_display_name_length
      check (display_name is null or char_length(display_name) <= 100);
  end if;
end $$;

-- logo_url: max 2048 characters (enforces RPC's char_length check)
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'gyms_logo_url_length' 
      and conrelid = 'public.gyms'::regclass
  ) then
    alter table public.gyms add constraint gyms_logo_url_length
      check (logo_url is null or char_length(logo_url) <= 2048);
  end if;
end $$;

-- ============================================================
-- TRIGGER FUNCTION: enforce_gyms_brand_only_update
-- ============================================================

-- BEFORE UPDATE trigger that blocks non-privileged callers from changing non-brand columns.
-- Allowed brand columns (from migration 040): display_name, logo_url, primary_color, accent_color
-- Protected columns: id, slug, name, timezone, created_at, and any future columns not in the brand set
create or replace function public.enforce_gyms_brand_only_update()
returns trigger language plpgsql
security invoker
set search_path = '' as $$
declare
  v_old_filtered jsonb;
  v_new_filtered jsonb;
  v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color'];
begin
  -- Allow service_role and postgres to update any column (privileged bypass)
  -- Use current_user to detect the actual role making the change.
  -- Service role JWT sets role to 'service_role', postgres connects as 'postgres'.
  -- Authenticated users have role 'authenticated' or 'anon'.
  if current_user in ('service_role', 'postgres') then
    return NEW;
  end if;

  -- For non-privileged callers: compare OLD and NEW excluding brand columns
  -- If any non-brand column changed, raise an error with custom SQLSTATE
  v_old_filtered := to_jsonb(OLD) - v_brand_columns;
  v_new_filtered := to_jsonb(NEW) - v_brand_columns;

  if v_old_filtered is distinct from v_new_filtered then
    raise exception 'Non-brand column update blocked: only display_name, logo_url, primary_color, accent_color may be updated'
      using errcode = 'GJC12',
            hint = 'Columns id, slug, name, timezone, created_at and future columns are read-only for this role';
  end if;

  return NEW;
end;
$$;

-- Revoke public execution, no grants needed (trigger invokes automatically)
revoke all on function public.enforce_gyms_brand_only_update() from public;

-- ============================================================
-- TRIGGER: gyms_brand_only_update
-- ============================================================

-- Drop existing trigger if present (idempotent)
drop trigger if exists gyms_brand_only_update on public.gyms;

-- BEFORE UPDATE trigger on gyms table
create trigger gyms_brand_only_update
  before update on public.gyms
  for each row
  execute function public.enforce_gyms_brand_only_update();

-- ============================================================
-- MIGRATION NOTES
-- ============================================================

-- This migration does NOT change RLS policies.
-- The existing gyms_owner_update policy (from migration 034) already restricts UPDATE to gym owners.
-- This trigger adds an additional layer: even owners can only update brand columns via direct UPDATE.
-- The set_gym_branding RPC (migration 040) remains the owner's primary interface.

-- Custom error code GJC12: follows the GJC-series convention (GJC01-11 used by gym_join_codes in migration 038).
-- SQLSTATE GJC12 is a user-defined error code (prefix 'GJC' puts it in the application error space).

-- Privileged bypass rationale:
-- - service_role: Admin operations, migrations, and app-level service tasks need full write access.
-- - postgres: Superuser migrations, schema changes, and emergency fixes.
-- Authenticated/anon users are blocked from modifying non-brand columns.

-- Future-proof: Any column added to gyms in future migrations will be locked by default (not in brand set).
-- To allow updates to a new column, add it to v_brand_columns in the trigger function.

-- ============================================================
-- UPDATE set_gym_branding: Remove dead var() checks (LOW-9)
-- ============================================================

-- Idempotently recreate set_gym_branding (originally from migration 040)
-- Changes from 040:
-- - Removed unreachable var() checks on primary_color and accent_color (lines 149-152, 161-164 in 040)
--   The regex ^#[0-9A-Fa-f]{6}$ already prevents var( from matching
-- - Removed unreachable BRND5 check (v_updated_count = 0)
--   The is_gym_owner() check already confirms the gym exists, and we're in a transaction
create or replace function public.set_gym_branding(
  p_gym_id uuid,
  p_display_name text default null,
  p_logo_url text default null,
  p_primary_color text default null,
  p_accent_color text default null,
  p_clear text[] default array[]::text[]
) returns json language plpgsql security definer
set search_path = '' as $$
declare
  v_field text;
  v_clear_display_name boolean := false;
  v_clear_logo_url boolean := false;
  v_clear_primary_color boolean := false;
  v_clear_accent_color boolean := false;
begin
  -- Check: caller must be the gym owner (BRND1)
  if not public.is_gym_owner(p_gym_id) then
    raise exception 'BRND1: Only the gym owner can update branding settings'
      using errcode = 'BRND1';
  end if;

  -- Validate clear field names and reject NULL elements (BRND6)
  if p_clear is not null then
    foreach v_field in array p_clear loop
      if v_field is null then
        raise exception 'BRND6: p_clear array cannot contain NULL elements'
          using errcode = 'BRND6';
      end if;
      if v_field not in ('display_name', 'logo_url', 'primary_color', 'accent_color') then
        raise exception 'BRND6: Invalid clear field name: %', v_field
          using errcode = 'BRND6';
      end if;
    end loop;
    
    -- Set clear flags
    v_clear_display_name := 'display_name' = any(p_clear);
    v_clear_logo_url := 'logo_url' = any(p_clear);
    v_clear_primary_color := 'primary_color' = any(p_clear);
    v_clear_accent_color := 'accent_color' = any(p_clear);
  end if;

  -- Validate display_name: reject blank/whitespace-only, enforce length
  if p_display_name is not null then
    if char_length(btrim(p_display_name)) < 1 then
      raise exception 'Display name cannot be blank or whitespace-only'
        using errcode = '22023';  -- invalid_parameter_value
    end if;
    if char_length(p_display_name) > 100 then
      raise exception 'Display name cannot exceed 100 characters'
        using errcode = '22023';
    end if;
  end if;

  -- Validate primary_color if provided (BRND2)
  if p_primary_color is not null then
    if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'BRND2: primary_color must be exactly 6-digit hex code (e.g. #FF9A2E)'
        using errcode = 'BRND2';
    end if;
  end if;

  -- Validate accent_color if provided (BRND3)
  if p_accent_color is not null then
    if p_accent_color !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'BRND3: accent_color must be exactly 6-digit hex code (e.g. #E8850C)'
        using errcode = 'BRND3';
    end if;
  end if;

  -- Validate logo_url if provided (BRND4)
  if p_logo_url is not null then
    if char_length(p_logo_url) < 1 or char_length(btrim(p_logo_url)) < 1 then
      raise exception 'BRND4: logo_url cannot be blank or whitespace-only'
        using errcode = 'BRND4';
    end if;
    if char_length(p_logo_url) > 2048 then
      raise exception 'BRND4: logo_url cannot exceed 2048 characters'
        using errcode = 'BRND4';
    end if;
    if p_logo_url !~ '^https://.+' and p_logo_url !~ '^/storage/.+' then
      raise exception 'BRND4: logo_url must start with https:// or /storage/ and contain a path'
        using errcode = 'BRND4';
    end if;
    if p_logo_url ~ '[\x00-\x1F\x7F]' then
      raise exception 'BRND4: logo_url cannot contain control characters or newlines'
        using errcode = 'BRND4';
    end if;
    if p_logo_url ~ '\.\.' then
      raise exception 'BRND4: logo_url cannot contain path traversal sequences (..)'
        using errcode = 'BRND4';
    end if;
  end if;

  -- Enforce color pair rule: both or neither (BRND7)
  -- When clearing colors, both must be cleared together
  if v_clear_primary_color or v_clear_accent_color then
    if v_clear_primary_color <> v_clear_accent_color then
      raise exception 'BRND7: Both primary_color and accent_color must be cleared together'
        using errcode = 'BRND7';
    end if;
  end if;
  -- When setting colors, both must be provided together
  if (p_primary_color is not null or p_accent_color is not null) 
     and not v_clear_primary_color and not v_clear_accent_color then
    if p_primary_color is null or p_accent_color is null then
      raise exception 'BRND7: Both primary_color and accent_color must be set together'
        using errcode = 'BRND7';
    end if;
  end if;

  -- Update the gym (clear takes precedence over set)
  update public.gyms
  set 
    display_name = case 
      when v_clear_display_name then null 
      else coalesce(p_display_name, display_name) 
    end,
    logo_url = case 
      when v_clear_logo_url then null 
      else coalesce(p_logo_url, logo_url) 
    end,
    primary_color = case 
      when v_clear_primary_color then null 
      else coalesce(p_primary_color, primary_color) 
    end,
    accent_color = case 
      when v_clear_accent_color then null 
      else coalesce(p_accent_color, accent_color) 
    end
  where id = p_gym_id;

  return json_build_object('success', true);
end;
$$;

-- Revoke from public and anon, grant only to authenticated users
revoke execute on function public.set_gym_branding(uuid, text, text, text, text, text[]) from public, anon;
grant execute on function public.set_gym_branding(uuid, text, text, text, text, text[]) to authenticated;
