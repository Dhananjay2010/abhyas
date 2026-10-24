-- Fix trigger functions to use empty search_path with fully qualified names
--
-- This migration recreates three trigger functions that are SECURITY DEFINER
-- to use `set search_path = ''` and fully qualified object references:
--
-- 1. handle_new_user() - creates profile and settings on signup
-- 2. set_user_id_from_parent() - denormalizes user_id to child tables
-- 3. set_updated_at() - maintains updated_at timestamps
--
-- These functions were originally created in 20260908090100_rls_and_triggers.sql.
-- handle_new_user() was recreated in 20260922090000_restore_signup_trigger.sql
-- with the same search_path=public setting.
--
-- Safe to run multiple times (idempotent via CREATE OR REPLACE).
-- Does not drop or recreate triggers - only updates function definitions.

-- ============================================================
-- set_updated_at() - timestamp maintenance trigger
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$fn$;

-- Revoke execute from all roles (trigger functions don't need EXECUTE permissions)
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ============================================================
-- set_user_id_from_parent() - user_id denormalization trigger
-- ============================================================

create or replace function public.set_user_id_from_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  parent_table text := tg_argv[0];
  parent_col   text := tg_argv[1];
  parent_id    uuid;
  owner_id     uuid;
begin
  parent_id := (pg_catalog.to_jsonb(new) ->> parent_col)::uuid;
  if parent_id is null then
    raise exception '%: % must not be null', tg_table_name, parent_col;
  end if;

  execute pg_catalog.format('select user_id from public.%I where id = $1', parent_table)
    into owner_id using parent_id;

  if owner_id is null then
    raise exception '%: no parent row in % for %', tg_table_name, parent_table, parent_id;
  end if;

  new.user_id := owner_id;
  return new;
end;
$fn$;

-- Revoke execute from all roles
revoke execute on function public.set_user_id_from_parent() from public, anon, authenticated;

-- ============================================================
-- handle_new_user() - new user profile creation trigger
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    pg_catalog.coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      pg_catalog.split_part(pg_catalog.coalesce(new.email, ''), '@', 1)
    ),
    pg_catalog.coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$fn$;

-- Revoke execute from all roles
revoke execute on function public.handle_new_user() from public, anon, authenticated;

comment on function public.set_updated_at() is
  'Trigger function to automatically update updated_at timestamps. '
  'SECURITY DEFINER with empty search_path and fully qualified names.';

comment on function public.set_user_id_from_parent() is
  'Trigger function to denormalize user_id from parent tables. '
  'SECURITY DEFINER with empty search_path and fully qualified names. '
  'Takes parent_table and parent_col as trigger arguments.';

comment on function public.handle_new_user() is
  'Trigger function to create profile and settings rows for new auth.users. '
  'SECURITY DEFINER with empty search_path and fully qualified names. '
  'Triggered on insert to auth.users.';
