# 02 — Database schema and row-level security

## What this delivers

The full Postgres schema in Supabase: 21 tables, 58 RLS policies, and the seed
reference data. This stores health data, so isolation between users is the
property that matters most.

## Current state

| | |
|---|---|
| Public tables | 21 |
| RLS policies | 58 |
| Tables with RLS disabled | **0** |
| Seeded equipment | 37 |
| Seeded warm-up exercises | 29 |
| Seeded breathing patterns | 6 |

## Migrations

Applied in order. **Applied migrations are immutable** — corrections ship as a
new migration, never by editing an old one.

| File | Contents |
|---|---|
| `20260908090000_initial_schema.sql` | Enums, all tables, indexes |
| `20260908090100_rls_and_triggers.sql` | RLS policies, triggers, grants |
| `20260908090200_seed_reference_data.sql` | Equipment, warm-ups, breathing patterns |
| `20260908210000_movement_patterns.sql` | `movement_pattern` enum + column, `cue` column |
| `20260908210100_seed_exercises.sql` | Exercise catalogue (generated) |
| `20260908210200_refresh_exercise_patterns.sql` | Catalogue correction (generated) |

Push with `supabase db push`. Query the remote without Docker using
`supabase db query --linked "<sql>"` — note the `--linked` flag, as it defaults
to a local database that does not exist here.

## Table groups

**Reference (public read, no writes):** `equipment`, `exercises`,
`exercise_media`, `exercise_substitutions`, `warmup_exercises`,
`breathing_patterns`, `yoga_playlists`, `yoga_videos`

**Per user (owner-only, all four verbs):** `profiles`, `user_settings`,
`user_equipment`, `user_injuries`, `programs`, `program_days`,
`program_day_exercises`, `sessions`, `session_exercises`, `session_sets`,
`exercise_progress`, `body_metrics`, `user_yoga_progress`

## Decisions and why

### Child tables carry a denormalised `user_id`

`program_days`, `program_day_exercises`, `session_exercises` and `session_sets`
all have their own `user_id` column, even though it is derivable from the
parent. This keeps every RLS policy a cheap column comparison
(`(select auth.uid()) = user_id`) instead of an `EXISTS` subquery evaluated per
row.

The obvious risk is a client writing the wrong `user_id`. That is closed by
**`set_user_id_from_parent()`**, a `SECURITY DEFINER` BEFORE INSERT/UPDATE
trigger that looks up the true owner from the parent row and overwrites
whatever the client sent. Because it runs as definer it can read the parent
regardless of RLS; because the INSERT policy still applies afterwards, a row
whose real owner is not the caller is rejected.

**This is verified, not assumed** — see below.

### `handle_new_user()` bootstraps a profile

A `SECURITY DEFINER` trigger on `auth.users` creates the matching `profiles`
and `user_settings` rows, pulling `full_name` and `avatar_url` from Google's
`raw_user_meta_data`. The app therefore never has to handle "signed in but no
profile row".

`profiles` has no INSERT or DELETE policy: the trigger creates it, and deleting
the auth user cascades.

### Media lives in its own table

`exercise_media` is separate from `exercises`, carrying `type`, `url`,
`youtube_id`, `attribution` and `licence`. This is deliberate: it means
swapping the media source later (free wger photos → a licensed GIF set) is a
data migration rather than a rewrite. **Never hardcode a media URL in a
component.**

### Enums over lookup tables

Muscles, body regions, movement patterns, impact and spinal load are Postgres
enums. They are closed sets that the rule engine switches on, so type safety at
the database boundary is worth more than the flexibility of a lookup table.

### `equipment_ids` is an array, not a join table

The core query is "every piece of equipment this exercise needs is in the
user's set", which is exactly array containment: `equipment_ids <@ available`.
A GIN index makes it fast. A junction table would turn this into a `NOT EXISTS`
subquery for no benefit.

### Day-wise data keys on `local_date`

`sessions.local_date` is a date computed in the user's own timezone
(`profiles.timezone`, default `Asia/Kolkata`), not a UTC timestamp. A session
started at 11pm belongs to that day, not the next.

## Verification performed

Run against the **live database** with a throwaway user, so no real data is
touched. All checks passed:

| Check | Result |
|---|---|
| Trigger creates profile row | 1 |
| Trigger creates settings row | 1 |
| Own profile update under RLS | 1 row |
| Weight / equipment / injury writes | accepted |
| Reference catalogue readable | yes |
| **Can see another user's profile** | **0 rows** |
| **Can forge a row for another user** | **blocked by RLS** |
| Cleanup cascade on user delete | 0 rows left |

And for the program chain specifically:

| Check | Result |
|---|---|
| Insert program under RLS | ok |
| **Deliberately forged `user_id` on a child row** | **corrected to true owner by the trigger** |
| Nested `program_day_exercises` insert | ok |
| Second active program for one user | blocked by partial unique index |
| Write into another user's program | no rows (parent invisible) |

Technique, for repeating this: create a user in `auth.users`, then
`set_config('role','authenticated')` plus `set_config('request.jwt.claims', …)`
to run subsequent statements under that identity. Note that after switching
role you cannot write to a temp table, so accumulate results in a variable and
insert them after switching back.

## Known gaps

- Minimum signup age (16) is enforced in the application layer only. A check
  constraint cannot use `current_date`, which is not immutable.
- `exercise_media` and `yoga_playlists` are both **empty** — see steps 05 and
  the yoga work still to come.
- No automated migration test on a fresh database; correctness so far is
  verified against the live one.

## Change log

- Initial schema, RLS, triggers and reference seed.
- Added `movement_pattern` enum and column, plus `cue`, for the block generator.
- Added `machine_generic` equipment row during the catalogue import.
