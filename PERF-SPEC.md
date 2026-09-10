# Performance specification — navigation latency

Agreed scope for the work on branch `perf/navigation-latency`. `SPEC.md` stays
the product definition; this file is the agreed definition of the performance
work, written before implementation so we can check the build against it.

## 1. The complaint

Tapping a tab or a button leaves the app looking frozen for a long moment
before the next screen appears. Nothing indicates that the tap registered, so
the app feels broken rather than slow.

## 2. What the code actually does today

Every finding below is read off the current `main`, not inferred.

### 2.1 Nothing in the app can be prerendered or prefetched

Every route exports `export const dynamic = "force-dynamic"`
(`src/app/today/page.tsx:11` and the same line in `history`, `progress`,
`settings`, `yoga`, `breathe`, `session/[id]`). `next build` on `main` lists
every route as `ƒ (Dynamic) server-rendered on demand`; the only static entry
is `/_not-found`.

### 2.2 There is no loading UI anywhere

There is no `loading.tsx` in the repo and no `<Suspense>` boundary in any
page. Next.js can only prefetch a dynamic route up to its nearest loading
boundary, so with none present a tap fetches the entire server render before
anything on screen changes. The whole wait — network, cold start, database —
is spent showing the *previous* screen.

### 2.3 The bottom navigation is rebuilt on every navigation

`BottomNav` is imported and rendered inside each page
(`src/app/today/page.tsx:326`, `history/page.tsx:79`, and so on) rather than
in a shared layout. It is therefore part of the swapped page segment: the nav
bar itself is torn down and re-rendered on every tab change, and the active
tab cannot highlight until the new page's HTML arrives.

### 2.4 Authentication is verified over the network twice per request

`supabase.auth.getUser()` is an HTTP call to Supabase's auth service. It runs
once in `src/proxy.ts` → `src/lib/supabase/session.ts:38`, and then again in
every page (`today/page.tsx:35`) and every server action
(`session/actions.ts:22`). So each navigation and each button press pays two
auth round trips before any real work starts.

The project publishes an ES256 signing key at
`/auth/v1/.well-known/jwks.json`, which means `getClaims()` can verify the
same token locally with no network call at all.

### 2.5 `/today` runs nine sequential database round trips

`src/app/today/page.tsx` awaits each of these in turn, so every one waits for
the one before it:

| # | Query | Where |
|---|---|---|
| 1 | `auth.getUser()` | proxy |
| 2 | `auth.getUser()` | `today/page.tsx:35` |
| 3 | `profiles` | `today/page.tsx:38` |
| 4 | `programs` (active) | `rollover.ts:73` via `ensureCurrentBlock` |
| 5 | `programs` (active) — **identical query to #4** | `today/page.tsx:60` |
| 6 | `program_days` | `today/page.tsx:83` |
| 7 | `program_day_exercises` | `today/page.tsx:94` |
| 8 | `user_equipment` count | `today/page.tsx:107` |
| 9 | `sessions` for today | `today/page.tsx:120` |

The other screens have the same shape in milder form: `/session/[id]` is six
waves, `/progress` five, `/history` four, `/settings` and `/yoga` three.

Measured cost of the *pattern* (ten trivial `select id … limit 1` calls against
this project's real Supabase instance, from this laptop):

```
10 sequential : 2383 ms   (median 187 ms each)
10 in parallel:  572 ms
```

The absolute numbers are inflated by distance — the app runs in `bom1`, next
to the database — but the 4× ratio between sequential and parallel is a
property of the code, not of where it is measured from.

### 2.6 Reference data is re-read on every request

`exercises`, `equipment`, `warmup_exercises`, `breathing_patterns`,
`yoga_playlists` and `yoga_videos` are seeded reference tables that change only
when we ship a migration, yet they are queried on every page render. All six
are readable with the anon key, so they can be cached outside any user's
session.

### 2.7 The client router cache is disabled for these routes

`experimental.staleTimes.dynamic` defaults to `0`. Returning to a tab visited
five seconds ago re-fetches the whole screen from the server.

### 2.8 Smaller items

- The landing page pulls all of `@supabase/supabase-js` into the browser
  (a 254 KB chunk) purely so the sign-in button can call `signInWithOAuth`.
- `history/page.tsx:35` selects the whole `session_volume` view with no filter
  while rendering only 60 rows.

### 2.9 Two findings that did not survive a closer look

Recorded because a reader of this document should not go looking for problems
that are not there.

- **`/dev/*` in production.** The harnesses are compiled into the build, but
  every one of them already calls `notFound()` unless `NODE_ENV` is
  `development`. They are unreachable in production; the only cost is build
  output size. Not worth changing.
- **Caching the reference tables (Stage 4 below).** The premise was that
  re-reading seeded data on every request is wasted work. Two facts undo it.
  The tables are tiny — 29 warm-up exercises, 72 pieces of equipment, 36
  breathing patterns — and once the waterfalls are collapsed those reads sit
  inside a parallel batch, so they cost nothing unless they are the slowest
  query in it. And they are readable by `authenticated` only, not `anon`
  (`grant select ... to authenticated`, policy `for select to authenticated`),
  so caching them across users would need either an RLS change — out of scope
  here — or a per-user cache key, which caches identical data once per user to
  save a query that was not on the critical path. Stage 4 is therefore dropped
  rather than implemented. If block generation ever becomes the complaint, the
  ~600-row `exercises` catalogue read in `lib/program/persist.ts` is the one
  worth revisiting.

## 3. What we are going to change

Staged so that each stage is separately verifiable and separately revertable.

### Stage 0 — Measure the real thing first

Add `Server-Timing` response headers behind a `PERF_DEBUG` environment
variable, breaking each request into `auth`, `db`, `render`. Deploy, take
readings from the live app on a real signed-in session, and record them. No
optimisation is claimed as a win without a before/after number from
production.

### Stage 1 — Make the app respond instantly to a tap

- Introduce an `(app)` route group whose layout renders the persistent shell:
  the bottom navigation stays mounted across navigations and highlights the
  active tab from `usePathname()`, so it reacts on the tap rather than on the
  response.
- Add `loading.tsx` skeletons for `today`, `history`, `progress`, `settings`,
  `yoga`, `breathe` and `session/[id]`, shaped like the real content.
- Route groups do not change URLs, so every existing link, redirect and
  bookmark keeps working.

### Stage 2 — Verify the session locally instead of over the network

- Replace `auth.getUser()` with `auth.getClaims()` in the proxy, in every page
  and in every server action, behind one shared helper wrapped in React
  `cache()` so a render verifies at most once.
- `getClaims()` falls back to `getUser()` by itself when a token cannot be
  verified locally, so this cannot lock anyone out; token refresh continues to
  happen because `getClaims()` goes through `getSession()`.

### Stage 3 — Collapse the waterfalls

- `/today`: fetch the profile and the active block together, drop the
  duplicate `programs` query by having `ensureCurrentBlock` return the row it
  already read, and fetch days, exercises, equipment and today's sessions in
  one parallel batch.
- Move the block-rollover check off the critical path — it is a no-op on 27 of
  every 28 days.
- Stream the genuinely secondary parts of a screen (`Your week`, the progress
  charts, history rows) inside `<Suspense>` so the primary content paints
  first.
- Same treatment for `/session/[id]`, `/progress`, `/history`.

### Stage 4 — Cache what never changes per user — **dropped**

See 2.9. Measured against the actual table sizes and the post-Stage-3 query
shape, this buys nothing and costs an invalidation obligation on every seed
migration.

### Stage 5 — Client cache and bundle

- Set `experimental.staleTimes` so tab switching reuses a recent payload,
  together with the `revalidatePath` calls needed to keep it correct after a
  mutation (`/history` and `/progress` are currently missed when a session
  completes).
- Load `@supabase/supabase-js` on demand in the sign-in button.

### Stage 6 — Re-measure and regression-test

## 4. What must not change

- No URL changes, no redirect changes, no change to the sign-in flow.
- No database schema, RLS policy or migration changes.
- No change to program generation, progression, streak or rollover logic.
- `npm test` (generator, progression, streaks) keeps passing.
- Every screen keeps the content it has today.

## 5. How we will know it worked

- `Server-Timing` from production, before and after, for `/today`,
  `/history`, `/progress`, `/settings`, `/session/[id]`.
- A skeleton is on screen within one frame of a tab tap.
- A walk-through of every flow: sign in, onboarding, build block, start
  session, log sets, finish exercise, finish session, history detail, progress,
  log weight, settings changes, yoga, breathing, sign out.

## 6. Round two — measured on the real app

Everything in sections 2 to 5 was reasoned from the code. This section is what
the instrumented preview actually said once it was in use with a real signed-in
session, and what that changed.

### 6.1 The numbers that mattered

From `PERF_DEBUG=1` on the preview, real requests:

```
/today          calls=5  supabase=78009ms  wall=35312ms   (cold)
/session/[id]   calls=7  supabase=124552ms wall=19265ms   (cold)
/today          calls=5  supabase=39780ms  wall=19364ms
/progress       calls=7  supabase=15129ms  wall=3834ms
/settings       calls=5  supabase=5368ms   wall=1272ms
/history        calls=3  supabase=2922ms   wall=990ms
/today          calls=5  supabase=6489ms   wall=2599ms
```

Two things fall out of this.

**The parallelisation works.** In every line the sum of the call durations is
several times the wall time, which is only possible if the calls overlap. The
waterfalls really are gone.

**Each individual call is still absurdly slow.** A primary-key select on
`profiles` took 1818 ms in the last line above, and 8323 ms in the first. The
function runs in `bom1` and the database is in Mumbai; this should be single
-digit milliseconds. There is a floor of roughly a second per Supabase round
trip when warm, and eighteen to twenty-seven seconds when the instance is
cold. **This, not the query count, is now the dominant cost**, and nothing in
the application code explains it.

### 6.2 Starting a session: nineteen round trips

The user's report — "starting a session took a very long time, and when the
screen came the timer already showed 30 seconds gone" — is fully explained by
the logs. A tap on Start ran:

1. `startSession`, seven sequential round trips;
2. a **complete re-render of Today**, five more, because the action called
   `revalidatePath("/today")` and revalidating a path re-renders it — and Today
   was the page the button was on;
3. the session screen itself, seven more.

The elapsed timer counts from the session row's `started_at`, which is written
in step 1, so the whole of steps 2 and 3 was already on the clock before the
runner appeared.

Fixed: `startSession` is three waves instead of seven, and revalidates nothing
— Today is refreshed on the way back instead, by `refreshAfterSession()` and
`abandonSession()`.

### 6.3 The same mistake, from the other direction

Four screens were rendering themselves twice per mutation: the Server Action
revalidated the path it was invoked from — which re-renders it — *and* the
client called `router.refresh()` afterwards. Settings paid that on every
toggle of a five-query screen; Progress on every weight logged, at seven
queries. The action's response already carries the re-rendered tree, so the
client refreshes are gone.

This is worth stating as a rule, because it is not obvious: **`revalidatePath`
on the page you are already on is not a cache hint, it is a synchronous
re-render on the critical path.** Use it for *other* screens; let the action's
own response handle the current one.

### 6.4 Starting a session now shows the session

A disabled button reading "Starting…" left the user on Today with no sense
that anything was happening. The button now renders the session screen's own
skeleton, full screen, the moment it is pressed — the same skeleton the route
shows, so nothing jumps when the navigation lands.

### 6.5 The one-second floor: the database is in Tokyo

Answered, and it is not the application's fault at all.

```
$ supabase projects list
{"ref":"bjtjhnfyheruxldqbmrj","name":"abhyas","region":"ap-northeast-1", ...}
```

`ap-northeast-1` is **Tokyo**. The serverless functions were pinned to `bom1`
— **Mumbai** — by an earlier commit whose message reads "Run serverless
functions in Mumbai, next to the database", and by a note in
`context/01-foundation-and-environment.md` stating the database lives in
Mumbai. Neither was ever checked; the region was recorded from memory.

Mumbai to Tokyo is roughly 120 ms of round-trip network. Every Supabase call
pays it, and a fresh TLS connection pays it three times before sending a byte.
That is the floor, and it explains every number in 6.1: why a primary-key
select costs about a second, why running five at once is so much better than
running five in sequence, and why a cold instance opening five or seven new
connections across an ocean took eighteen to twenty-seven seconds.

It also explains why my own measurement from this laptop showed a trivial
select costing ~161 ms of "Supabase-side" time against a gateway that answers
in ~36 ms: the gateway is a nearby Cloudflare edge, and the extra 125 ms is the
hop to Tokyo.

**`vercel.json` now pins `hnd1` — Tokyo — the region the database is actually
in.** The expected effect is to take roughly 120 ms off *every* Supabase round
trip, which on a five-call screen is worth far more than any further query
tuning.

The trade-off, stated plainly: the user is in India, so putting the functions
in Tokyo adds roughly 100 ms to the single hop between their phone and the
server, to remove roughly 120 ms from each of the five to seven hops between
the server and the database. Net clearly positive, but it is splitting the
difference.

**The better fix is to move the database to `ap-south-1` (Mumbai)**, putting
the data next to both the compute and the user. Supabase cannot change a
project's region in place — it means a new project and a restored backup — so
it is a decision, not a patch.

### 6.6 What this means for the query work

Sections 2 to 5 collapsed the waterfalls, and 6.1 shows that worked. But the
premise underneath — that the round-trip *count* was the problem — was only
half right. The count mattered so much precisely because each round trip cost
120 ms more than it should have. With the region corrected, a further
consolidation into single-call-per-screen database functions is worth much
less than it looked an hour ago, so it is **deferred until the region change
has been measured** rather than built on an assumption for a second time.

### 6.7 Measured after the region change

Production, `hnd1`, same code and same database — only the region moved. Taken
with `src/app/api/diag/route.ts`, which measures the path between the function
and Supabase directly and needs no signed-in session:

```
region              hnd1
event-loop lag      0.5 - 4.4 ms
single query, warm  36 ms   (was ~1000 ms)
5 in parallel       74 ms wall  (was ~1272 ms)
auth health         43 ms
jwks fetch          61 ms
first call on a
  cold instance     ~500-600 ms, then 24-47 ms
```

**A Supabase round trip went from roughly a second to 36 ms.** The event-loop
lag figure settles the other half of the question: the process was never
starved, so every one of those slow fetches really was the network, and no
amount of query tuning would have touched it.

The one remaining cold-path cost is the first call on a fresh instance,
~500-600 ms, which is the TLS handshake. It is paid once per instance, and it
is the strongest remaining argument for collapsing a screen into a single
database call — one handshake instead of five — but at 500 ms once, not
19 seconds every time.

### 6.8 Moving the database to Mumbai

Requested, and correct in principle: `ap-south-1` would put the data next to
both the compute and the user instead of splitting the difference. Recorded
here as a plan rather than a completed step, because two parts of it cannot be
done from a terminal.

**What it is worth, now that the region is fixed.** The remaining gain is
roughly 100 ms on the single hop between the phone and the server, plus perhaps
20 ms per database round trip. Call it 150-200 ms per page load. That is real,
but it is a refinement on top of a change that already recovered around 950 ms
per query — worth doing, worth knowing the scale of.

**What it takes.** Supabase cannot change a project's region in place; there is
no such command, only `projects create` / `projects delete` and PITR restore
*within* a project. So:

1. Full dump of the existing project, including the `auth` schema — without
   `auth.users` the accounts are gone and every `profiles.id` is orphaned.
2. A new project in `ap-south-1`.
3. Restore schema, then data.
4. New URL and anon key into Vercel and `.env.local`; `vercel.json` back to
   `bom1`.
5. Re-point Google OAuth.
6. Verify sign-in on the new project *before* cutting production over, then
   retire the old one.

**The two blockers.**

- **Step 1 needs Docker.** `supabase db dump` shells out to `pg_dump` inside a
  container and refuses a local binary; `pg_dump` 18.6 is now installed via
  `brew install libpq` but the CLI does not use it. Docker Desktop needs
  administrator rights to install.
- **Step 5 needs credentials that should not pass through a terminal.** A new
  project means a new ref, so `https://<new-ref>.supabase.co/auth/v1/callback`
  has to be added to the Google Cloud OAuth client, and that client's ID and
  secret have to be entered into the new project's auth settings. Those are
  entered by hand, in the two dashboards, by their owner.

Until both are cleared the cutover stays undone, and production keeps running
on Tokyo compute next to the Tokyo database — which is a correct, consistent
configuration, just not the optimal one.

### 6.9 The migration, and what it measured

The database now lives in `ap-south-1` and `vercel.json` is back to `bom1`, so
the user, the compute and the data are all in India. Full runbook and the
verification in `context/14-database-region-migration.md`.

Probe from the production function, same application code throughout:

| Configuration | Single query | Five in parallel |
|---|---|---|
| `bom1` → Tokyo (as found this morning) | ~1000 ms | ~1272 ms wall |
| `hnd1` → Tokyo (interim) | 36 ms | 74 ms wall |
| **`bom1` → Mumbai (now)** | **~20 ms** | **35–70 ms wall** |

Sign-in was verified against the migrated account rather than assumed: the new
project has exactly one `auth.users` row and one `auth.identities` row, the
profile still joins to it, and `onboarding_completed_at` is the original
timestamp. Google matched the migrated identity instead of minting a second
user, which was the failure this migration could most plausibly have produced.

### 6.10 Where it finished

| | single query | five in parallel |
|---|---|---|
| `bom1` → Tokyo, as found | ~1000 ms | ~1272 ms wall |
| `hnd1` → Tokyo, interim | 36 ms | 74 ms wall |
| **`bom1` → Mumbai, now** | **~20 ms** | **35–70 ms wall** |

Roughly **fifty times** faster on the cost that dominated every screen, plus
the user's own hop to the server back inside India. On top of that: a tap now
paints a skeleton within a frame instead of freezing the previous screen,
starting a session runs three round trips instead of nineteen, and four
screens stopped rendering themselves twice per mutation.

The order in which those were found is worth remembering. The first pass spent
its effort on round-trip *count*, which was real but secondary; the thing that
actually dominated was a region recorded from memory and never checked. **The
measurement should have come first, and the reason it did not is that the
existing note in `context/` read like a fact.**

### 6.11 The profiler was lying by omission

Page-level `[perf]` lines appeared in preview logs and never in production.
The cause is the scheduling: `after()` runs the callback once the response has
been sent, and on production the instance is frozen at that moment, so the
output goes nowhere. Only the proxy's synchronous line survived.

That is worse than having no profiler, because the empty output reads as "no
slow requests" rather than "no data". The summary is now written by a short
timer re-armed by each Supabase call, firing once they stop and while the
request is still alive, with `after()` kept as a backstop and a flag so only
one of them speaks.

**The general lesson, worth more than the fix:** an instrument that can fail
silently has to be checked against a case where it is known to have something
to say. This one was only ever confirmed on preview.

### 6.12 Previous open question (resolved above)

Still to be explained. The profiler now also records event-loop lag, cold
versus warm, and region on every line, because a fetch that takes a second
because the network took a second, and a fetch that takes a second because the
process was too starved to run the callback that resolves it, look identical
from the outside and want opposite fixes. `src/app/api/diag/route.ts` measures
the same thing directly: gateway round trips that touch no table, the cheapest
real query repeated warm, five of them in parallel, and event-loop lag around
all of it.

Depending on the answer, the next step is one of:

- **Network or gateway bound** — collapse each screen to a *single* database
  round trip with a Postgres function returning JSON, rather than five or seven
  parallel ones. Today, the session screen, Progress and Settings each become
  one call.
- **Process starved / cold-start bound** — attack boot cost and keep instances
  warm; fewer, larger responses still help, but less.

## 7. Explicitly out of scope for now

Next.js 16 Cache Components (`cacheComponents: true`) with partial
prerendering and partial prefetching. It is the deeper fix and it is where
this app eventually wants to go, but it changes how every page reads cookies
and is too large a change to land in the same pass as the above. Revisit once
these stages are measured.
