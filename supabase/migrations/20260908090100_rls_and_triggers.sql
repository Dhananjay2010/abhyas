-- Abhyas — row-level security and triggers
-- This is health data. Every user table is RLS-protected, no exceptions.

-- ============================================================
-- HELPER TRIGGERS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- Child tables carry a denormalised user_id so RLS policies stay a simple column
-- comparison instead of an EXISTS subquery on every row. This trigger fills it from
-- the parent so the client can never set it incorrectly: it runs as definer, reads the
-- true owner, and the INSERT policy then rejects the row if that owner isn't the caller.
create or replace function public.set_user_id_from_parent()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  parent_table text := tg_argv[0];
  parent_col   text := tg_argv[1];
  parent_id    uuid;
  owner_id     uuid;
begin
  parent_id := (to_jsonb(new) ->> parent_col)::uuid;
  if parent_id is null then
    raise exception '%: % must not be null', tg_table_name, parent_col;
  end if;

  execute format('select user_id from public.%I where id = $1', parent_table)
    into owner_id using parent_id;

  if owner_id is null then
    raise exception '%: no parent row in % for %', tg_table_name, parent_table, parent_id;
  end if;

  new.user_id := owner_id;
  return new;
end;
$fn$;

create trigger program_days_set_user_id
  before insert or update on public.program_days
  for each row execute function public.set_user_id_from_parent('programs', 'program_id');

create trigger program_day_exercises_set_user_id
  before insert or update on public.program_day_exercises
  for each row execute function public.set_user_id_from_parent('program_days', 'program_day_id');

create trigger session_exercises_set_user_id
  before insert or update on public.session_exercises
  for each row execute function public.set_user_id_from_parent('sessions', 'session_id');

create trigger session_sets_set_user_id
  before insert or update on public.session_sets
  for each row execute function public.set_user_id_from_parent('session_exercises', 'session_exercise_id');

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

create trigger exercise_progress_updated_at
  before update on public.exercise_progress
  for each row execute function public.set_updated_at();

-- ============================================================
-- NEW USER BOOTSTRAP
-- Google is the only provider in v1; it supplies full_name and avatar_url.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS — REFERENCE TABLES (read-only to signed-in users)
-- No insert/update/delete policies exist, so writes are denied by default.
-- ============================================================

do $do$
declare t text;
begin
  foreach t in array array[
    'equipment','exercises','exercise_media','exercise_substitutions',
    'warmup_exercises','breathing_patterns','yoga_playlists','yoga_videos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t
    );
  end loop;
end
$do$;

-- ============================================================
-- RLS — USER TABLES (owner-only, all four verbs)
-- ============================================================

do $do$
declare t text;
begin
  foreach t in array array[
    'user_settings','user_equipment','user_injuries',
    'programs','program_days','program_day_exercises',
    'sessions','session_exercises','session_sets',
    'exercise_progress','body_metrics','user_yoga_progress'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      t || '_owner_select', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      t || '_owner_insert', t);

    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_owner_update', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      t || '_owner_delete', t);
  end loop;
end
$do$;

-- profiles keys on id, not user_id, and cannot be inserted or deleted by the client
-- (the auth trigger creates it; deleting the auth user cascades).
alter table public.profiles enable row level security;

create policy profiles_owner_select on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ============================================================
-- GRANTS
-- Row access is governed by RLS above; these are table-level privileges only.
-- ============================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
