# 13 — Navigation performance

Delivered on branch `perf/navigation-latency`. The agreed definition of the
work is `PERF-SPEC.md` at the repo root; this file is the implementation
record.

## What this step delivers

Tapping a tab or a button used to leave the app looking frozen. Three
independent causes, addressed separately:

1. **Nothing painted until the server answered.** No route had a loading
   boundary, so Next.js had nothing to prefetch and nothing to show; the
   previous screen stayed on display for the whole wait.
2. **The wait was longer than it needed to be.** Every page verified the
   session over the network twice and then awaited its queries in a chain.
3. **Every visit paid the wait again.** The client router cache was disabled
   for dynamic routes, so returning to a tab re-fetched it from scratch.

## How it is implemented

### Instant feedback — `loading.tsx`, `src/components/skeleton.tsx`

Every route now has a `loading.tsx`: `today`, `history`, `history/[id]`,
`progress`, `settings`, `yoga`, `breathe`, `session/[id]`, `onboarding`. Each
uses the primitives in `src/components/skeleton.tsx` (`Bar`, `Card`,
`ScreenSkeleton`) and is shaped like the screen it stands in for — same page
padding, same heading size, same card heights — so real content lands in place
instead of shoving a placeholder aside.

Where the real heading is known ahead of time ("History", "Progress",
"Settings") the skeleton prints it rather than a grey bar. Seeing the right
title immediately is most of what makes the tap feel answered.

`src/app/dev/loading-states/page.tsx` renders all of them stacked, because in
normal use they exist for a fraction of a second and cannot be judged.

### A tab bar that never unmounts — `src/components/bottom-nav.tsx`, `src/app/layout.tsx`

`BottomNav` used to be imported and rendered by each page, which made it part
of the segment Next.js swaps on navigation: destroyed and rebuilt on every tab
change, with its highlight unable to move until new HTML arrived.

It is now a client component mounted once in the root layout. It decides
whether it belongs on the current route from an allowlist (`ACTIVE_FOR`) keyed
on `usePathname()`, so the highlight moves on the tap rather than on the
response. Full-screen routes — the landing page, onboarding, the guided
session — match nothing in the allowlist and get no bar. An allowlist rather
than a list of exclusions, so a future full-screen route does not have to
remember to opt out.

Route URLs are unchanged. No files moved and no route group was introduced;
the bar simply reads the path.

The tab links use **automatic** prefetching, deliberately not `prefetch={true}`.
Automatic fetches only the destination's loading skeleton, which is all a tap
needs to paint instantly. `prefetch={true}` would render all four tabs in full
on every screen — including Today, which is where a finished four-week block
rolls over into the next one. The user would then never see the "Block N
starts today" message, because the rollover would have happened inside a
prefetch they never asked for.

### Local session verification — `src/lib/supabase/auth.ts`

`supabase.auth.getUser()` is an HTTP call to Supabase's auth service. It ran
in `src/lib/supabase/session.ts` (the proxy) *and* again in every page and
every server action, so a tap paid two auth round trips before any of the
screen's own data was fetched.

Both now call `supabase.auth.getClaims()`, which verifies the access token's
signature locally against the project's published JWKS. The project signs with
**ES256** (confirmed at `/auth/v1/.well-known/jwks.json`, one key, `alg`
`ES256`, `use` `sig`), so verification is pure local crypto; the key set is
fetched once per warm server instance and held in the auth library's module
scope (`GLOBAL_JWKS` in `@supabase/auth-js`).

Three properties make this a safe swap rather than merely a fast one:

- **Refresh still happens.** `getClaims()` reads the session through
  `getSession()`, which calls `_callRefreshToken` when the access token is at
  or near expiry and writes the rotated cookies back through the proxy's
  `setAll`. That is exactly what the "do not remove" comment in the proxy
  protects, and it is unchanged.
- **It cannot lock anyone out.** If a token cannot be verified locally — a
  project still on legacy HS256 symmetric secrets, a runtime without
  WebCrypto, an unrecognised key id — `getClaims()` calls `getUser()` itself.
  The worst case is the latency we had before.
- **Only `sub` and `email` were ever used.** A grep of the app confirms no
  caller touched `user_metadata`, `app_metadata` or anything else on the `User`
  object; `display_name` comes from the `profiles` row, not the token.

`getSessionUser()` and `createClient()` are both wrapped in React's `cache()`,
so a render verifies once and builds one Supabase client no matter how many
components ask.

The trade-off, stated plainly: a locally verified token is trusted until it
expires, so a session revoked server-side stays usable for the remainder of
that access token's hour.

### Collapsed waterfalls

The shape of the problem, measured against this project's real database (ten
trivial `select id ... limit 1` calls):

```
10 sequential : 2383 ms   (median 187 ms each)
10 in parallel:  572 ms
```

The absolute figures are inflated by distance — the app runs in `bom1`, next
to the database — but the ratio is a property of the code.

| Screen | Waves before | Waves after |
|---|---|---|
| `/today` | 8 | 2 |
| `/session/[id]` | 6 | 1 |
| `/progress` | 3 | 1 |
| `/history` | 2 | 1 |
| `/settings`, `/yoga`, `/breathe` | 2 | 1 |

**`/today`** (`src/app/today/page.tsx`). Wave one fetches the profile, the
active block and the equipment count together. Wave two fetches the week's
days — with each day's exercises *embedded*, one round trip instead of two —
alongside today's sessions. The duplicate `programs` query is gone:
`ensureCurrentBlock` now takes an optional `activeBlock` argument
(`src/lib/program/rollover.ts`), so on the twenty-seven days in twenty-eight
when nothing rolls over it compares two dates and makes no database call at
all. When a rollover does happen the block row is re-read, because the one the
page already had is stale.

**`/session/[id]`** (`src/app/session/[id]/page.tsx`). One wave. Two
dependencies were removed rather than parallelised: the sets already logged
come back embedded in the session row (`sessions → session_exercises →
session_sets`), so nothing has to learn the session-exercise ids first; and
`exercise_progress` is read whole rather than filtered by the exercise ids
from an earlier query — RLS already scopes it to this user and it holds one
small row per lift they have ever trained.

The `exercises` embed is still disambiguated by constraint name
(`exercises!session_exercises_exercise_id_fkey`) because `session_exercises`
references `exercises` twice, once for the exercise and once for
`swapped_from_exercise_id`. Without the hint PostgREST answers PGRST201.

**`/progress`** and **`/history`** collapse to a single `Promise.all` each; the
profile is only needed for a timezone and nothing waits on it. History's
`session_volume` read is now bounded to 120 rows — it previously aggregated
every session the user had ever completed in order to annotate at most sixty.

Every embed and every nested ordering above was executed against the live
PostgREST schema before being written into a page, so none of them can be
hiding a PGRST201 or an invalid `referencedTable`.

### Client router cache — `next.config.ts`, `src/lib/revalidate.ts`

`experimental.staleTimes` is set to `{ dynamic: 30, static: 300 }`. Next.js
defaults `dynamic` to `0`, which meant tapping back to a tab seen five seconds
ago re-fetched the whole screen.

That is only correct if every mutation invalidates the screens it affects, and
several did not. Completing a session, finishing a yoga video and finishing a
breathing practice all change History and Progress, but only `/today` was ever
revalidated — harmless while every visit re-fetched anyway, wrong the moment
anything is cached. `revalidateTrainingData()` names `/today`, `/history` and
`/progress` in one place and is called from `startSession`,
`abandonSession`, `buildPlan`, the yoga and breathing actions and the end of
onboarding.

**`finishSession` still revalidates nothing, on purpose.** Any revalidation
inside a Server Action re-renders the route the user is on; here that is the
session route, whose `status === "completed" → redirect("/today")` guard would
fire and take the summary away before it could be read. That was a real bug
once and the comment guarding it predates this work. The same refresh now runs
from `refreshAfterSession()`, called by the summary's own "Back to Today"
button, where a re-render resolving to `/today` is exactly where the user
asked to go.

### Bundle — `src/app/sign-in-button.tsx`

`@supabase/supabase-js` was in the landing page's first load — a 256 KB
uncompressed chunk shipped to every first-time visitor so that one button
could call `signInWithOAuth`. It is now imported inside the click handler, by
which point the button is already showing its pending state.

Measured with `next build`'s own route bundle stats, before and after:

| Route | Before | After |
|---|---|---|
| `/` | 696.8 KB | 454.2 KB |
| `/today` | 453.5 KB | 454.6 KB |
| `/history` | 451.4 KB | 452.5 KB |

The ~1 KB the other routes gain is the persistent tab bar becoming a client
component.

### Profiling — `src/lib/perf.ts`

Set `PERF_DEBUG=1` and each request logs one line naming every Supabase round
trip it made, what each cost, and the wall time:

```
[perf] /today calls=5 supabase=61ms wall=88ms slowest=profiles:19,... seq=[profiles programs user_equipment program_days sessions]
```

The instrumentation wraps the Supabase client's `fetch` rather than sitting in
the pages, so it describes a page's cost without a single timing call inside
it, and adds nothing but a boolean check when the flag is off. The summary is
emitted through `after()` so it stays off the response path. The proxy logs
its own line, on every exit including the unauthenticated redirect.

## What was verified

- `npm test` (generator, progression, streaks): all three suites pass.
- `npx tsc --noEmit` and `npx eslint src --max-warnings=0`: clean.
- `next build`: succeeds; route inventory unchanged.
- Every new PostgREST embed, nested order and embedded filter was run against
  the live database before being used.
- Rendered in a browser at mobile width: landing page, `/dev/session` (the
  guided-session runner), `/dev/settings`, `/dev/history` and
  `/dev/loading-states`. The tab bar appears on the tabbed screens and is
  correctly absent from the full-screen session harness.
- `PERF_DEBUG=1` logging confirmed end to end locally, for both the proxy line
  and the per-page line.

## Known gaps

- **The authenticated screens have not been driven end to end by the author.**
  Sign-in is Google OAuth and cannot be performed on the user's behalf, so
  `/today`, `/history`, `/progress`, `/settings`, `/session/[id]`, `/yoga` and
  `/breathe` were verified by type checking, by validating every query against
  the live schema, and by rendering their components through the dev
  harnesses — not by logging in and clicking. Real before/after numbers must
  come from `PERF_DEBUG=1` on a deployment with a real session.
- **No Suspense streaming.** Each screen is behind one loading boundary rather
  than streaming its slower sections independently. Worth revisiting only if
  the per-page logs show one query dominating a wave.
- **Cache Components not adopted.** Next.js 16's `cacheComponents` and
  `partialPrefetching` are the deeper fix — real static shells rather than
  skeletons — but they change how every page reads cookies for auth. Held back
  deliberately; see `PERF-SPEC.md` section 6.
- **Reference-table caching dropped**, with reasoning, in `PERF-SPEC.md` 2.9.

## The finding that mattered more than all of the above

The database is in `ap-northeast-1` (**Tokyo**). The serverless functions were
pinned to `bom1` (**Mumbai**) by an earlier commit titled "Run serverless
functions in Mumbai, next to the database", and by a note in
`context/01-foundation-and-environment.md` that stated the same. The region had
been written down from memory and then trusted twice — including by the work
above, which spent its first pass optimising round-trip *count* while each
round trip silently cost 120 ms of ocean.

`supabase projects list` settles it in one line, and now appears in the context
notes so it cannot be assumed again.

`vercel.json` pins `hnd1`. Measured on production with
`src/app/api/diag/route.ts`, same code and same database:

| | Mumbai compute | Tokyo compute |
|---|---|---|
| Single query, warm | ~1000 ms | **36 ms** |
| Five in parallel | ~1272 ms wall | **74 ms wall** |
| Event-loop lag | — | 0.5-4.4 ms |

The lag figure is what proves the diagnosis rather than merely fitting it: the
process was never starved, so the slow fetches were genuinely the network.

## Change log

| Date | Change |
|---|---|
| 2026-09-10 | Step created: loading skeletons, persistent tab bar, local JWT verification, collapsed query waterfalls, client router cache, landing-page bundle cut, `PERF_DEBUG` profiling. |
| 2026-09-10 | `startSession` collapsed from seven waves to three, and stripped of the `revalidatePath("/today")` that made it re-render Today on the critical path. Four screens stopped rendering twice per mutation (action revalidation *and* `router.refresh()`). Start now shows the session skeleton immediately. |
| 2026-09-10 | Serverless region corrected from `bom1` to `hnd1` after discovering the database is in Tokyo, not Mumbai. A Supabase round trip went from ~1000 ms to 36 ms. Merged and deployed to production. |
