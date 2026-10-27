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

-- Primary color: must be NULL or a strict 6-digit hex code (#RRGGBB)
alter table public.gyms add constraint gyms_primary_color_hex
  check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$');

-- Accent color: must be NULL or a strict 6-digit hex code (#RRGGBB)
alter table public.gyms add constraint gyms_accent_color_hex
  check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');

-- Logo URL: must be NULL or start with https:// or /storage/
-- Allows fully qualified URLs (https://...) or Supabase Storage paths (/storage/v1/object/...)
alter table public.gyms add constraint gyms_logo_url_format
  check (
    logo_url is null 
    or logo_url ~ '^https://' 
    or logo_url ~ '^/storage/'
  );

-- ============================================================
-- RPC: set_gym_branding (owner-only)
-- ============================================================

-- Set brand fields for a gym (owner-only).
-- Validates colors and logo format. Only the gym's owner can update.
-- SECURITY DEFINER with search_path='' to avoid SQL injection.
create or replace function public.set_gym_branding(
  p_gym_id uuid,
  p_display_name text default null,
  p_logo_url text default null,
  p_primary_color text default null,
  p_accent_color text default null
) returns json language plpgsql security definer
set search_path = '' as $$
declare
  v_updated_count int;
begin
  -- Check: caller must be the gym owner (BRND1)
  if not public.is_gym_owner(p_gym_id) then
    raise exception 'BRND1: Only the gym owner can update branding settings'
      using errcode = 'BRND1';
  end if;

  -- Validate primary_color if provided (BRND2)
  if p_primary_color is not null and p_primary_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'BRND2: primary_color must be a 6-digit hex code (e.g. #FF9A2E)'
      using errcode = 'BRND2';
  end if;

  -- Validate accent_color if provided (BRND3)
  if p_accent_color is not null and p_accent_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'BRND3: accent_color must be a 6-digit hex code (e.g. #E8850C)'
      using errcode = 'BRND3';
  end if;

  -- Validate logo_url if provided (BRND4)
  if p_logo_url is not null 
     and p_logo_url !~ '^https://' 
     and p_logo_url !~ '^/storage/' then
    raise exception 'BRND4: logo_url must start with https:// or /storage/'
      using errcode = 'BRND4';
  end if;

  -- Update the gym (only if owner check passed)
  update public.gyms
  set 
    display_name = coalesce(p_display_name, display_name),
    logo_url = coalesce(p_logo_url, logo_url),
    primary_color = coalesce(p_primary_color, primary_color),
    accent_color = coalesce(p_accent_color, accent_color)
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
do $$
begin
  revoke execute on function public.set_gym_branding(uuid, text, text, text, text) from public, anon;
  grant execute on function public.set_gym_branding(uuid, text, text, text, text) to authenticated;
exception when undefined_function then
  null;
end $$;

-- ============================================================
-- EXTEND get_gym_brand TO RETURN BRAND FIELDS
-- ============================================================

-- Return public brand fields for a gym (name, slug, timezone, logo, colors).
-- SECURITY DEFINER bypasses RLS so anon visitors on a gym's domain can see the brand.
-- Members and staff CANNOT see other gyms' branding (only their own via RLS on gyms table).
-- This function is called by the app on the homepage to style the gym's domain.
create or replace function public.get_gym_brand(p_gym_id uuid)
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
do $$
begin
  revoke execute on function public.get_gym_brand(uuid) from public;
  grant execute on function public.get_gym_brand(uuid) to anon, authenticated;
exception when undefined_function then
  null;
end $$;
