# 14 — Moving the database to Mumbai

Status: **in progress.** Backup taken and verified; the new project cannot be
created until a free-plan slot is released. This file is the runbook and the
record.

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

## Change log

| Date | Change |
|---|---|
| 2026-09-10 | Created. Backup taken and verified; blocked at step 1 on the free-plan project limit. |
