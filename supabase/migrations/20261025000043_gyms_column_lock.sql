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
