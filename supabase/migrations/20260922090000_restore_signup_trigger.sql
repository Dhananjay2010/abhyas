-- Restore the trigger that gives every new user a profile.
--
-- WHAT BROKE. `on_auth_user_created` on `auth.users` was gone from production.
-- `public.handle_new_user()` was still there: it lives in the `public` schema,
-- so it came across in the schema dump when the database was moved to Mumbai on
-- 2026-09-10 (see context/14). The TRIGGER lives on `auth.users`, and Supabase
-- rebuilt the `auth` schema from its own baseline. The function survived; the
-- wiring did not.
--
-- HOW IT SHOWED. Every signup after 2026-09-10 got an `auth.users` row and no
-- `profiles` row. Around thirty queries read `profiles` with `.single()`, which
-- PostgREST fails as "Cannot coerce the result to a single JSON object", so
-- /today threw during the server render and the browser showed nothing but
-- "Minified React error #441". Nobody noticed for three days because the only
-- account in the database already had its rows -- including through a full QA
-- pass that reset that account to a blank onboarding rather than deleting it.
--
-- The function is recreated as well as the trigger, so this migration is
-- sufficient on its own on any database.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
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

-- Heal the accounts created while the trigger was missing, so nobody has to
-- sign up again. `on conflict do nothing` makes this safe to re-run.
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  coalesce(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  )
from auth.users u
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- Let a signed-in user create their OWN profile row.
--
-- The original comment on these policies reads "profiles ... cannot be inserted
-- or deleted by the client (the auth trigger creates it)". That was a single
-- point of failure, and it failed: with the trigger gone there was no second
-- way for the row to come into existence, so the app could only sit there
-- throwing. `with check` pins the row to the caller's own uid, and `id` is a
-- foreign key to auth.users, so this does not let anyone invent a profile for
-- somebody else.
--
-- Deleting is still not granted. Removing an account is `auth.users` cascading,
-- not something the client should do a row at a time.
drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);
