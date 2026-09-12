# 02 — Database schema and row-level security

## What this delivers

The full Postgres schema in Supabase: 21 tables, 58 RLS policies, and the seed
reference data. This stores health data, so isolation between users is the
property that matters most.

## Current state

Counted against the live database on 2026-09-12, after step 16 added
`breathing_logs` and its four policies.

| | |
|---|---|
| Public tables | 22 |
| RLS policies | 62 |
| Tables with RLS disabled | **0** |
| Public functions | 4 |
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
| `20260912090000_breathe_phase_one.sql` | Breathing pattern phases and content, `breathing_logs`, breathing preference columns on `user_settings`, `record_breathing_practice()` — step 16 |
| `20260913090000_breathe_sound.sql` | Guidance widened to `tones`/`ocean`/`voice`/`off`, background-sound and voice-language preferences, Bhramari's exhale marked as hummed — step 16, phase 2a |
| `20260914090000_breathe_your_own.sql` | Four more practices, the `user_breathing_patterns` table (your timings and your own practices), `breathing_logs.user_pattern_id`, and `record_breathing_practice()` replaced to accept either kind — step 16, phase 2b |
| `20260915090000_breathe_routines.sql` | The `breathing_routines` catalogue (four seeded sequences), `breathing_logs.routine_id`/`routine_name`/`routine_step`, and `record_breathing_practice()` replaced again so a later step appends to the session the first step opened — step 16, phase 3a |
| `20260916090000_breathe_kapalabhati.sql` | Kapalabhati, the first pattern using the `pump` and `rest` phase kinds, and `user_settings.breathing_kapalabhati_ack` for its one-time safety confirmation — step 16, phase 3c |
| `20260917090000_breathe_shapes.sql` | `breathing_patterns.shape`, so each practice declares what it looks like while you do it — step 16, phase 3b |
| `20260918090000_breathe_journey.sql` | The `breathing_journeys` catalogue (the seven-day course), `user_journey_progress`, and `advance_journey_day()` — the only `SECURITY DEFINER` function in the breathing section, because the progress table has no write policy — step 16, phase 3d |

Push with `supabase db push`. Query the remote without Docker using
`supabase db query --linked "<sql>"` — note the `--linked` flag, as it defaults
to a local database that does not exist here.

## Table groups

**Reference (public read, no writes):** `equipment`, `exercises`,
`exercise_media`, `exercise_substitutions`, `warmup_exercises`,
`breathing_patterns`, `breathing_routines`, `breathing_journeys`,
`yoga_playlists`, `yoga_videos`

**Per user (owner-only, all four verbs):** `profiles`, `user_settings`,
`user_equipment`, `user_injuries`, `programs`, `program_days`,
`program_day_exercises`, `sessions`, `session_exercises`, `session_sets`,
`exercise_progress`, `body_metrics`, `user_yoga_progress`, `breathing_logs`

`breathing_logs` is a child of `sessions` and follows the same rule as the other
child tables: `set_user_id_from_parent('sessions', 'session_id')` sets its
owner. It is normally written only through `record_breathing_practice()`, a
`SECURITY INVOKER` function, so RLS still governs every statement inside it
(step 16).

**Read-only to the client:** `user_journey_progress`. It is per-user and
owner-readable like the tables above, but has no insert, update or delete
policy: `advance_journey_day()` is its only write path (step 16, phase 3d).

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
- 2026-09-12 (step 16): breathing phases and content on `breathing_patterns`, the
  `breathing_logs` table (RLS, owner trigger), breathing preference columns and
  a 1–60 range on `meditation_default_minutes`, and
  `record_breathing_practice()`. The function was verified as the real user
  under RLS inside a transaction that rolled back.
- 2026-09-12 (step 16, phase 2a): the breathing guidance values widened to
  `tones`, `ocean`, `voice` and `off` in both `user_settings` and
  `breathing_logs`, plus columns for the background sound, its volume and the
  voice language. No new tables or policies, so the counts above still hold.
- 2026-09-12 (step 16, phase 2b): four more breathing practices, and
  `user_breathing_patterns` — one table for both your own practices and your
  timings for ours, told apart by whether `base_pattern_id` is set, with a
  partial unique index giving you one set of timings per practice. That makes
  **23 tables and 66 policies.** `record_breathing_practice()` was replaced
  (the old signature dropped) to take either kind of practice, and it refuses
  one that is not yours.
- 2026-09-12 (step 16, phase 3a): `breathing_routines`, a reference table with
  a single read policy like `breathing_patterns`, holding four seeded
  sequences of practices in a `steps jsonb` column. That makes **24 tables and
  67 policies.** `breathing_logs` gained `routine_id`, `routine_name` and
  `routine_step`, all nullable, so every practice logged before this and every
  single practice from now on is unchanged.
  `record_breathing_practice()` was replaced again (the old signature dropped)
  with three further arguments: a later step of a routine passes the session
  the first step opened, and its seconds are added to that session's duration.
  The early return on an existing log id is what keeps a retry from
  double-counting them. It was verified as the real user under RLS in a
  rolled-back transaction — including against a second user created inside that
  transaction, whose session was invisible, unwritable and untouched.
- 2026-09-12 (step 16, phase 3d): `breathing_journeys`, a reference table with
  a single read policy holding the seven-day course in a `days jsonb` column,
  and `user_journey_progress`, one row per person per course. That makes **26
  tables and 69 policies** — and note that the count of policies rose by only
  two for two tables, because `user_journey_progress` deliberately has a select
  policy and **no write policy at all.**

  It is the one per-user table here that the client cannot write. Every change
  goes through `advance_journey_day()`, the section's only `SECURITY DEFINER`
  function, because the two rules that make the course a course — days in
  order, one counted per calendar day — have to live somewhere the caller
  cannot skip. Definer rights are safe here for the usual reason: everything it
  touches is scoped to `auth.uid()`, it is granted only to `authenticated`, and
  it counts a day only against a `breathing_logs` row that is the caller's own.
  Verified as the real user under RLS in rolled-back transactions: twelve
  checks, including that a second user's practice cannot count your day and
  that direct writes and inserts to the progress table are both refused.
