# 14 — Moving the database to Mumbai

Status: **complete.** The old project has been deleted.

| | |
|---|---|
| Project | `brldynuhozaszaduwfse` — `ap-south-1` (Mumbai) |
| Functions | `bom1` (Mumbai), alongside the data |
| Old project | `bjtjhnfyheruxldqbmrj` (Tokyo) — deleted 2026-09-10 |
| Backup | `../Fitness-db-backup-2026-09-10/` — roles, schema, data incl. `auth` |

## Why

The database was created in `ap-northeast-1` (Tokyo) while the app's users and
its serverless functions are in India. `context/13-performance.md` covers the
first half of the fix: the functions were pinned to `bom1` (Mumbai) on the
mistaken belief that the database was there too, and moving them to `hnd1`
(Tokyo) took a Supabase round trip from ~1000 ms to 36 ms.

That leaves the compute correctly beside the data but both of them 6,000 km
from the person using the app. Moving the database to `ap-south-1` and the
functions back to `bom1` puts all three in the same place.

**What it is worth:** roughly 100 ms on the single hop between the phone and
the server, plus perhaps 20 ms per database round trip — call it 150–200 ms
per page load. Worth having, and worth knowing it is a refinement on top of a
change that already recovered around 950 ms per query.

## The constraint that shapes everything

**A Supabase project's region is fixed at creation.** There is no in-place
migration: `supabase projects` offers `list`, `create`, `api-keys` and
`delete`, and `supabase backups` only does point-in-time restore *within* a
project. So "move the database" means "create a second project and move the
data into it".

The free plan allows **two active projects per user**, and both slots are in
use (`abhyas`, `Pahadi Adda`). A third cannot be created:

```
The following organization members have reached their maximum limits for the
number of active free projects ... (2 project limit)
```

Paused projects do not count as active, so pausing one releases a slot.
Pausing is reversible; deleting is not, which is why the runbook pauses.

## Backup — done, and verified

Taken 2026-09-10 with the Supabase CLI (which runs `pg_dump` in a container;
`colima` provides the runtime, no administrator rights required):

```
supabase db dump --linked --role-only          -f roles.sql
supabase db dump --linked                      -f schema.sql
supabase db dump --linked --data-only --use-copy -f data.sql
```

Kept at `../Fitness-db-backup-2026-09-10/`. `data.sql` covers the `public`,
`storage` **and `auth`** schemas — the last of these matters more than any
other, because `profiles.id` references `auth.users(id)` and losing the auth
rows would orphan every record in the database.

Verified row counts, so a restore can be checked against something:

| | rows | | rows |
|---|---|---|---|
| `auth.users` | 1 | `program_day_exercises` | 26 |
| `auth.identities` | 1 | `program_days` | 14 |
| `exercises` | 604 | `session_exercises` | 12 |
| `yoga_videos` | 200 | `yoga_playlists` | 9 |
| `equipment` | 37 | `breathing_patterns` | 6 |
| `warmup_exercises` | 29 | `sessions` | 3 |
| `profiles` | 1 | `programs` | 2 |
| `user_settings` / `user_equipment` / `user_injuries` / `body_metrics` | 1 each | `session_sets`, `exercise_progress` | 0 |

No sets have been logged yet, so the irreplaceable data is small: one account,
one profile, two blocks and three sessions. Everything else is seed data that
the migrations can rebuild.

## Runbook

Steps marked **[you]** cannot be done from a terminal.

1. **[you]** Supabase dashboard → project `abhyas` → Settings → General →
   **Pause project**. This is what frees the slot. The app goes down here.
2. `supabase projects create abhyas-mumbai --org-id ippghdhetykmiaxlrqmy
   --region ap-south-1 --db-password <generated>`
3. Restore into it, in order: `roles.sql`, `schema.sql`, `data.sql`.
4. Check the row counts above against the new database.
5. **[you]** New project → Authentication → Providers → Google: paste the same
   OAuth **client ID and secret** already used by the Tokyo project. These are
   credentials and are entered by their owner, in the dashboard, not through
   this terminal.
6. **[you]** Google Cloud Console → that OAuth client → Authorised redirect
   URIs → add `https://<new-ref>.supabase.co/auth/v1/callback`. A new project
   means a new ref, so the old callback URL no longer applies.
7. **[you]** New project → Authentication → URL Configuration → Site URL
   `https://abhyas-indol.vercel.app`, and the same redirect URLs as the old
   project.
8. Update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
   Vercel (all three environments) and in `.env.local`.
9. `vercel.json` → `"regions": ["bom1"]`, since the data is now in Mumbai.
10. Deploy, sign in, and walk the flows.
11. Only then: delete the old Tokyo project.

## Rollback

Until step 8 nothing about the live app has changed; abandoning the migration
means un-pausing the Tokyo project and deleting the Mumbai one. After step 8,
rollback is reverting the two environment variables and `vercel.json` and
redeploying — the Tokyo project still holds the data until step 11 removes it.

## What the restore actually did

Restored with `psql` against the new project, in order: `roles.sql`,
`schema.sql`, `data.sql`. Two errors, both `permission denied` on
`storage.buckets_vectors` and `storage.vector_indexes` — internal Supabase
tables this app does not use, empty in the source. Nothing else failed.

Verified afterwards, because matching row counts alone would not catch a
broken restore:

| Check | Result |
|---|---|
| Row counts, 18 tables incl. `auth.users` | all match the backup |
| RLS policies | 58 |
| Tables with RLS enabled | 22 |
| Views (`session_volume`, `exercise_strength_history`) | 2 |
| Functions / triggers | 3 / 12 |
| Orphaned `program_day_exercises`, `session_exercises`, `program_days`, `profiles` | **0** |

The orphan checks are the ones that matter. `exercises.id` is
`gen_random_uuid()` and the seed migration inserts by slug without explicit
ids, so **re-running the migrations on the new project would have minted
different UUIDs and dangled every `program_day_exercises.exercise_id`**. That
is why the data was restored from the dump rather than rebuilt by
`supabase db push`.

`supabase_migrations.schema_migrations` is not part of a `db dump`, so the ten
applied versions were re-registered with `supabase migration repair --status
applied <version>`, one at a time — the command rejects a space-separated
list. `supabase migration list` now shows local and remote in sync.

## Measured

Probe (`/api/diag`) from the production function, same code throughout:

| Configuration | Single query | Five in parallel |
|---|---|---|
| `bom1` → Tokyo (original) | ~1000 ms | ~1272 ms wall |
| `hnd1` → Tokyo (interim) | 36 ms | 74 ms wall |
| **`bom1` → Mumbai (now)** | **~20 ms** | **35–70 ms wall** |

On top of which the user's own hop to the server is back to Indian latency
rather than crossing to Tokyo.

## Verified after cut-over

Signed in against the migrated account, then checked the database directly
rather than trusting the screen:

| Check | Result |
|---|---|
| `auth.users` | **1** — Google matched the migrated identity |
| `auth.identities` | 1 |
| Profile joins to that user | yes |
| `onboarding_completed_at` | unchanged, 2026-09-09 |
| Programs / active days / planned exercises | 2 / 7 / 26 |

The single-user check is the one that mattered. Had Google minted a second
account instead of matching the migrated `auth.identities` row, sign-in would
still have "worked" — straight into an empty onboarding flow, with every
existing record stranded behind an unreachable id.

`startSession` was exercised too, though not in the way it first appeared.
No new session row showed up after the test, which looked wrong until the
backup was compared: session `8b758fda` was `in_progress` when the dump was
taken and is `skipped` now. So the tap took the **resume** path — found today's
open session, confirmed its four exercises, handed the user to it — and
`abandonSession` closed it on exit. Exactly right, and the absence of a new
row was the evidence rather than a problem. The create-a-new-session path has
not been observed since the rewrite.

## Change log

| Date | Change |
|---|---|
| 2026-09-10 | Created. Backup taken and verified; blocked at step 1 on the free-plan project limit. |
| 2026-09-10 | Old project paused to free a slot. `abhyas-mumbai` created in `ap-south-1`, roles/schema/data restored, integrity verified, migration history repaired. Vercel and local environment variables re-pointed; `vercel.json` back to `bom1`; deployed. |
| 2026-09-10 | Google OAuth re-pointed at the new project; sign-in verified against the migrated account; Tokyo project deleted. Migration complete. |
- **2026-09-13.** **The move cost us the signup trigger, and it took three days to find out.** `on_auth_user_created` sits on `auth.users`; the dump-and-restore carried the `public` schema, so `handle_new_user()` came across while the trigger did not — Supabase rebuilds `auth` from its own baseline. Every signup after 10 September got an auth user and no `profiles` row, and `/today` answered with `Cannot coerce the result to a single JSON object` behind a blank React error page. The verification in this document counted "functions / triggers 3 / 12" and matched row counts, and neither check could see an absent trigger in a schema it did not dump. **When this project next moves database, diff the triggers on `auth.users` explicitly, and create a throwaway account to prove signup still works.** Restored by `20260922090000_restore_signup_trigger.sql`; the app now creates the rows from the auth callback as well.
