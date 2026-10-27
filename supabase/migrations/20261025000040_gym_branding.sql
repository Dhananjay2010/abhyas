-- Gym branding fields for white-label customization
-- Adds brand fields to gyms table and RPCs for owner-only updates.
-- Extends get_gym_brand to return brand colors and logo.

-- ============================================================
-- ADD BRAND COLUMNS TO GYMS TABLE
-- ============================================================

-- Add brand columns (all nullable, idempotent)
do $$
begin
  -- Display name: optional override for name (e.g. shorter or different branding)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'gyms' 
      and column_name = 'display_name'
  ) then
    alter table public.gyms add column display_name text;
  end if;

  -- Logo URL: either full https:// URL or relative path (e.g. /storage/v1/object/public/gym-logos/...)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'gyms' 
      and column_name = 'logo_url'
  ) then
    alter table public.gyms add column logo_url text;
  end if;

  -- Primary brand color (main accent color, used for CTAs and highlights)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'gyms' 
      and column_name = 'primary_color'
  ) then
    alter table public.gyms add column primary_color text;
  end if;

  -- Accent color (secondary/hover color, typically darker or more saturated than primary)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'gyms' 
      and column_name = 'accent_color'
  ) then
    alter table public.gyms add column accent_color text;
  end if;
end $$;

-- ============================================================
-- CHECK CONSTRAINTS (idempotent)
-- ============================================================

-- Drop existing constraints if present (for re-running migration)
alter table public.gyms drop constraint if exists gyms_primary_color_hex;
alter table public.gyms drop constraint if exists gyms_accent_color_hex;
alter table public.gyms drop constraint if exists gyms_logo_url_format;

-- Primary color: must be NULL or exactly 6-digit hex code (#RRGGBB), anchored and case-sensitive subset
alter table public.gyms add constraint gyms_primary_color_hex
  check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$');

-- Accent color: must be NULL or exactly 6-digit hex code (#RRGGBB), anchored and case-sensitive subset
alter table public.gyms add constraint gyms_accent_color_hex
  check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');

-- Logo URL: must be NULL or start with anchored case-sensitive https:// or /storage/
-- Allows fully qualified URLs (https://...) or Supabase Storage paths (/storage/v1/object/...)
-- Rejects bare https://, control characters, newlines, and path traversal (..)
alter table public.gyms add constraint gyms_logo_url_format
  check (
    logo_url is null 
    or (logo_url ~ '^https://.+' and logo_url !~ '[\x00-\x1F\x7F]' and logo_url !~ '\.\.')
    or (logo_url ~ '^/storage/.+' and logo_url !~ '[\x00-\x1F\x7F]' and logo_url !~ '\.\.')
  );

-- ============================================================
-- RPC: set_gym_branding (owner-only)
-- ============================================================

-- Set brand fields for a gym (owner-only).
-- Validates colors and logo format. Only the gym's owner can update.
-- Supports clearing fields via p_clear array.
-- SECURITY DEFINER with search_path='' to avoid SQL injection.
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
  v_updated_count int;
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

  -- Validate display_name: reject blank/whitespace-only, enforce length (LOW-2)
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
    if p_primary_color ~ 'var\(' then
      raise exception 'BRND2: primary_color cannot contain CSS var() functions'
        using errcode = 'BRND2';
    end if;
  end if;

  -- Validate accent_color if provided (BRND3)
  if p_accent_color is not null then
    if p_accent_color !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'BRND3: accent_color must be exactly 6-digit hex code (e.g. #E8850C)'
        using errcode = 'BRND3';
    end if;
    if p_accent_color ~ 'var\(' then
      raise exception 'BRND3: accent_color cannot contain CSS var() functions'
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

  get diagnostics v_updated_count = row_count;

  -- If no rows updated, gym doesn't exist (BRND5)
  if v_updated_count = 0 then
    raise exception 'BRND5: Gym not found'
      using errcode = 'BRND5';
  end if;

  return json_build_object('success', true);
end;
$$;

-- Revoke from public and anon, grant only to authenticated users
revoke execute on function public.set_gym_branding(uuid, text, text, text, text, text[]) from public, anon;
grant execute on function public.set_gym_branding(uuid, text, text, text, text, text[]) to authenticated;

-- ============================================================
-- EXTEND get_gym_brand TO RETURN BRAND FIELDS
-- ============================================================

-- Drop the existing get_gym_brand function (from migration 037) to change return type.
-- CREATE OR REPLACE cannot change the return type (would fail with 42P13).
-- This is idempotent: DROP IF EXISTS allows re-running the migration.
drop function if exists public.get_gym_brand(uuid);

-- Return public brand fields for a gym (name, slug, timezone, logo, colors).
-- SECURITY DEFINER bypasses RLS so anon visitors on a gym's domain can see the brand.
-- Members and staff CANNOT see other gyms' branding (only their own via RLS on gyms table).
-- This function is called by the app on the homepage to style the gym's domain.
create function public.get_gym_brand(p_gym_id uuid)
returns table (
  name text,
  slug text,
  timezone text,
  display_name text,
  logo_url text,
  primary_color text,
  accent_color text
) language sql security definer
set search_path = ''
stable as $$
  select 
    g.name,
    g.slug,
    g.timezone,
    g.display_name,
    g.logo_url,
    g.primary_color,
    g.accent_color
  from public.gyms g
  where g.id = p_gym_id
  limit 1;
$$;

-- Revoke from PUBLIC, grant to anon and authenticated
revoke execute on function public.get_gym_brand(uuid) from public;
grant execute on function public.get_gym_brand(uuid) to anon, authenticated;
