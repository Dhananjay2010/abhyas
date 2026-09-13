# 17 — QA pass 2: the whole app as a new user, against production

The first QA pass ([15](15-qa-fixes.md)) could not sign in, so it worked
through the `/dev/*` harnesses and by reading server code. This pass ran the
app **as a brand new user against production** with a real Google session, and
covers everything except the Breathe tab, which Dhananjay had already tested
thoroughly himself.

The findings live in [QA-FINDINGS-2.md](../QA-FINDINGS-2.md) in full. This file
records what was changed in the code and how each change was verified.

## How the pass was set up

The account for `dhananjay.rtr@gmail.com` was wiped in Supabase — every row in
every user table deleted and `profiles` reset so `onboarding_completed_at` was
null — which made `/onboarding` run from its first screen exactly as a new
signup would. The persona used was: date of birth 1996-06-15, male, 175 cm,
78 kg, build muscle, beginner, at a gym, 4 days a week, no yoga days,
**equipment: yoga mat only** (chosen deliberately, as a realistic new-user
mistake), no injuries. Days per week was later changed to 6 and equipment to
"I have access to everything", which also exercised the Settings rebuild path.

Two QA scripts were added, because Today renders only one day and there is no
way to inspect the rest of a generated block through the UI:

- `scripts/qa/repro-week.ts` — runs the real `generateProgram` over the
  committed catalogue export and prints all seven days of a block.
- `scripts/qa/repro-pools.ts` / `repro-pools2.ts` — run the real `isEligible`
  and report, per profile, how many exercises survive the filters and which
  movement patterns end up with nothing at all.

These use the real functions and the real catalogue, not stubs. Their day-7
output was compared against what production actually generated for the same
profile and matched in structure, which is what makes them trustworthy.

## What was changed

### The rest timer no longer freezes on screen

`src/app/session/[id]/session-runner.tsx`. The rest panel rendered on
`restRemaining > 0`, a counter maintained by an effect that opens
`if (restEndsAt === null) return;`. Clearing the end time therefore stopped the
interval without zeroing the counter, so the panel stayed on screen with the
countdown frozen. Three of the four paths that clear it were affected: the rest
panel's own **Skip** button, **Undo** on a logged set, and finishing an
exercise. Only natural expiry looked right, because that path sets the counter
to 0 before clearing the end time.

The panel is now rendered on `restEndsAt !== null` — the state that actually
means "a rest is running". Deriving visibility from the source of truth removes
the whole class of bug rather than patching the one symptom; it also avoids a
`setState` inside the effect, which `react-hooks/set-state-in-effect` rejects.

*Verified* in `/dev/session`, which mounts the real `SessionRunner` with the
server actions stubbed — the bug is purely client-side state, so the harness
exercises the real path. Skip at `0:07` closes the panel immediately, and the
exercise transition leaves nothing behind. It could not be re-checked against
production because a completed session for the day blocks starting another.

### A backfilled day is no longer named after a movement it does not contain

`src/lib/program/generate.ts`. When none of a day's slots can be filled, the
generator backfills with the four highest-scoring eligible exercises. It kept
the template's label while doing so, which produced a day headed "Pull"
containing four core exercises for a bodyweight-at-home beginner — the
catalogue has no equipment-free horizontal pull, so every pull slot and every
`PATTERN_FALLBACK` alternative misses. Such a day is now labelled "Full body".

This makes the app honest; it does not fix the underlying coverage gap, which
is a catalogue job.

### The warm-up respects the equipment list

`src/lib/program/warmup.ts`. `selectWarmup` declared
`availableEquipment: Set<string> | null` in its input type and never
destructured it, so the cardio choice came from `track` alone and every weights
user was offered "Easy stationary bike" first — including one whose entire
equipment list was a yoga mat. A `CARDIO_EQUIPMENT` map (`easy-bike` →
`stationary_bike`, `easy-row` → `rowing_machine`, `skipping-light` →
`jump_rope`) now filters the preference list. The requirement lives in code
because `warmup_exercises` has no equipment column. Brisk walk and marching in
place need nothing, so a fallback always exists.

### `user_settings` writes upsert instead of update

`src/app/settings/actions.ts` and `src/app/breathe/actions.ts`. Both wrote with
`.update().eq("user_id", …)`. PostgREST treats an update matching zero rows as
success, so with no `user_settings` row the action returned `ok`, the toggle
moved on screen, and the value was gone on the next load — with no error shown.
Both now `upsert` on `user_id`, letting the table's column defaults fill
anything the patch omits.

The row is created by the `on_auth_user_created` trigger, so a real signup has
one; the gap was found because the QA reset deleted it. The fragility is real
regardless: nothing outside the trigger guarantees the row, and the failure
mode was silent.

### Copy

- `src/lib/onboarding/options.ts` — `SPLIT_BY_DAYS` gained entries for 1 and 2
  training days. Without them the template fallback rendered "Full body,
  1 times a week" and "Full body, 2 times a week" beside a correctly worded
  "Full body, three times a week", on the yoga-days step.
- `src/app/progress/page.tsx` — "Best streak" hard-coded `sub="sessions"` and
  read "1 sessions" while the current streak beside it pluralised correctly.

## Verified

- `npm test` — all five suites pass (generator, progression, streaks, dates,
  breathing).
- `npx tsc --noEmit` and `npx eslint src scripts` — both clean.
- The rest timer fix, in the dev harness, as described above.
- Mobile layout at 375 × 812 on the session, settings, charts and onboarding
  screens: no horizontal overflow.

## Known gaps

Everything the pass found and did **not** fix is in
[QA-FINDINGS-2.md](../QA-FINDINGS-2.md). The ones that need a product decision
rather than a patch:

- Main-lift selection penalises equipment, so a fully equipped gym user is
  given push-ups, a medicine-ball slam and a plyometric jump as their three
  main lifts (`score()` in `generate.ts`).
- Catalogue `movement_pattern` / `mechanic` / `cue` are rule-derived and wrong
  often enough to put mis-tagged novelty movements into main-lift slots.
- No equipment-free horizontal pull exists in the catalogue, so the bodyweight
  track cannot train back at all.
- Isometric exercises are prescribed and logged in reps; the schema has no
  notion of a timed exercise.
- The "What about tomorrow?" prompt, PRs in the summary, rest-day overrides,
  active recovery and a real static-stretch cool-down are all specified in
  `SPEC.md` and not built.
- `preferred_session_minutes` is stored and read by nothing.
- The block number increments on every rebuild, not every four weeks.

Not testable from here: real iOS Safari (wake lock, vibration, audio unlock,
PWA install); resume, "End session early", per-set-logging off and daily-menu
mode, all of which need a session that can be started on a day with no
completed session.

## Change log

| Date | Change |
|---|---|
| 2026-09-13 | Created. Full end-to-end pass against production as a new user. Fixed: the frozen rest timer, backfilled days keeping a misleading label, the warm-up ignoring available equipment, `user_settings` writes silently no-opping, and two plural/copy bugs. |
