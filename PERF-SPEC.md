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
- `/dev/*` preview harnesses are compiled into the production build.
- `history/page.tsx:35` selects the whole `session_volume` view with no filter
  while rendering only 60 rows.

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

### Stage 4 — Cache what never changes per user

- Wrap reference-table reads in `unstable_cache` with a long revalidate and a
  tag per table, using an anon Supabase client so no user data enters the
  cache.

### Stage 5 — Client cache and bundle

- Set `experimental.staleTimes` so tab switching reuses a recent payload,
  together with the `revalidatePath` calls needed to keep it correct after a
  mutation (`/history` and `/progress` are currently missed when a session
  completes).
- Load `@supabase/supabase-js` on demand in the sign-in button.
- Exclude `/dev/*` from the production build.

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

## 6. Explicitly out of scope for now

Next.js 16 Cache Components (`cacheComponents: true`) with partial
prerendering and partial prefetching. It is the deeper fix and it is where
this app eventually wants to go, but it changes how every page reads cookies
and is too large a change to land in the same pass as the above. Revisit once
these stages are measured.
