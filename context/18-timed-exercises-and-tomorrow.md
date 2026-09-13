# 18 — Timed exercises, and "what about tomorrow?"

Two things [QA pass 2](../QA-FINDINGS-2.md) found missing, specified in
[SPEC.md §7](../SPEC.md) before either was built.

## Timed exercises

### What it delivers

An exercise measured in seconds rather than reps: prescribed as a time range,
run as a countdown on screen, and logged in `session_sets.duration_seconds`.
Before this, a plank was prescribed as "2 sets × 8–12 reps" with a reps box and
a kilograms box, so the only way to record a 45-second hold was to invent a rep
count — and that invented number then drove progression.

### How it is implemented

**`exercises.metric`** (`reps` | `seconds`, default `reps`), added in
`supabase/migrations/20260920090000_timed_exercises.sql`. It is **curated, not
inferred**: "Iron Cross" is a dumbbell raise done for reps and "Isometric
Wipers" is a hold, and no name rule separates them. Six catalogue rows are
`seconds` — `plank`, `side-bridge`, `isometric-chest-squeezes`,
`isometric-wipers` and the two `isometric-neck-exercise-*`. Everything else
keeps the safe default, so a future seed only has to set the column.

**The target range reuses `program_day_exercises.target_reps_min` /
`target_reps_max`.** Those columns are a range *in the exercise's own metric*;
`metric` says which unit. This was a deliberate choice over adding
`target_seconds_*`: one pair of columns means one code path in the generator,
the runner, Today and History, at the cost of column names that are sometimes
about seconds. Both columns carry a `comment on column` saying so.

- `prescribe()` (`src/lib/program/prescription.ts`) takes a fourth argument and
  returns `HOLD_SECONDS_BY_GOAL` for a `seconds` exercise — 15–30 s for
  strength up to 30–60 s for fat loss, mirroring the rep table — and caps rest
  at 75 s, because a hold never needs a heavy-single rest.
- `generateProgram()` passes `picked.metric` through; `CandidateExercise` and
  `CATALOGUE_COLUMNS` carry it.

**Progression is double progression on time** (`progression.ts`):

- `LoggedSet` gained `durationSeconds`, kept separate from `reps` so a caller
  cannot pass one where the other is meant. `valueOf()` is the single place the
  two are read alike, keyed on `meta.metric`.
- Every set at the top of the range adds `HOLD_STEP_SECONDS` (5 s).
- At `HOLD_CEILING_SECONDS` (120 s) more time stops buying anything: an
  exercise with a progression chain moves to a harder variation, and one
  without is told to add weight instead. Otherwise the app would march a
  beginner towards five-minute planks.
- **Epley is skipped for holds.** A one-rep max estimated from a hold length is
  nonsense — 60 s of weighted plank would read as a triple-bodyweight lift — so
  a timed exercise never contributes an `best_e1rm`. It does record a longest
  hold in `best_reps`.
- The "hold" message no longer says "staying at this weight" for work that has
  no weight, which was also wrong for every unloaded bodyweight exercise.

**The runner** (`session-runner.tsx`). `SetEntry` gained a `metric` and a
`targetSeconds`. For a hold it shows a **"Hold for 30s"** button; tapping it
runs a countdown built the same way as the rest timer — an absolute end
timestamp, so a phone that locks loses nothing, and visibility derived from
`holdEndsAt` rather than the remaining count. At zero it beeps and vibrates
through the same settings as the rest timer and writes the target into the
seconds field. "Stop early" writes the elapsed time instead. Nothing is
prefilled before the hold runs, so a set nobody performed cannot be logged by
tapping through — the same rule the reps field already followed.

`logSet` and `validateSet` take `durationSeconds`; the bound is an hour.
`session_sets.duration_seconds` and its CHECK constraint already existed.

Today renders `3 × 20–45s`, and History renders `45s` instead of `45 reps`.

### A bug this surfaced

`SetEntry` was keyed on the set number alone, so moving between exercises at
the same set number reused the component instance and `useState` kept its first
value. The weight typed for the bench press was still sitting in the box on the
lat pulldown, one tap from being logged against it. The key is now
`${exerciseId}:${setNumber}`.

## "What about tomorrow?"

### What it delivers

At the end of every session: *keep the plan · swap the day · rest*, about
tomorrow. On Today, the same question about today when yesterday was a training
day nobody completed. SPEC §7 called this "what makes the plan feel like
yours"; the app ended a session at "Back to Today".

### How it is implemented

**A choice is a one-day override**: a `sessions` row for that date with
`status = 'planned'`, its `actual_type`, and a `program_day_id` when a real
training day was chosen. `planDay()` in `src/app/session/actions.ts` writes it.

- It refuses a date in the past, and refuses any day already `completed` or
  `in_progress`, so it can never rewrite history or pull the plan out from
  under a running session.
- **"Keep the plan" deletes any override** rather than writing one, which is
  what makes the prompt free to change your mind with.
- It replaces an existing planned row rather than inserting beside it. Stacking
  rows per day is exactly how the four duplicate "Skipped" entries in History
  happened (QA pass 2, M4).
- The row is stamped with `week_in_block` and `is_deload`. `startSession` fills
  those in only on the path where it creates the session itself; resuming a
  planned row keeps what it was written with, so a null week would have read
  "Week 1" and silently skipped a deload.

**Today prefers the override** (`today/page.tsx`). The block is a weekly
template keyed on weekday; without reading the override first the choice would
be written and then ignored. `src/lib/program/day-plan.ts` holds the
resolution (`resolveDay`), the alternatives offered (`plannableDays`, which
deduplicates by label so a four-day split does not offer "Upper" twice), and
`nextDayPlan` for the end-of-session prompt. Today also blanks the weekday's
exercises when the override is rest, yoga or breathing, so the block's own work
cannot leak through underneath.

**Nothing shifts.** Choosing rest does not push the block forward: the dates,
the deload week and the week-in-block arithmetic are all untouched, and a
declined workout is simply not done. That was a deliberate decision — the
alternative moves the block end date every time anyone rests.

`DayPlanPrompt` (`src/components/day-plan-prompt.tsx`) is shared by both
places; only the framing changes. Its planner is injectable, like the runner's
other actions, so it can be driven in `/dev/session`.

## Verified

- `npm test` — all five suites, including eleven new checks on timed
  progression and four on prescribing a hold.
- `npx tsc --noEmit`, `npx eslint src scripts`, `npm run build` — all clean.
- **The hold, end to end in `/dev/session`**, which mounts the real
  `SessionRunner`: "Plank · 2 sets × 6–10s", the countdown runs, at zero the
  panel closes and the seconds field fills with the target, the logged set
  reads "10s" rather than "10 reps", and stopping early after four seconds
  recorded `4`.
- **The prompt, end to end in the same harness**: "What about tomorrow? /
  Tomorrow is Legs", swap offers Push / Pull / Legs / Yoga / Breathing, and
  choosing Pull settles to "Tomorrow is Pull" with a "Change it" link.
- The `SetEntry` key fix, by watching a stale 60 kg disappear from a plank.

## Known gaps

- **The migration has not been applied.** `supabase db push` is blocked from
  this environment. Until it runs, `exercises.metric` does not exist, and the
  code now selects it — so **the migration must be pushed before this is
  deployed**, or every session, Today and History page will fail.
- **`planDay` itself has not been exercised against the database.** The prompt
  was driven with the planner stubbed, which proves the component and not the
  action. It needs one real session after the deploy: choose "rest" for
  tomorrow, then check Today tomorrow.
- The catalogue fixture (`scripts/fixtures/catalogue.json`) predates `metric`,
  so the generator tests take the `?? "reps"` fallback. Refresh it with
  `scripts/export-catalogue.sh` once the migration is live.
- Only six exercises are holds, because that is all this catalogue has. Wall
  sits, dead hangs, L-sits and carries are absent and would need seeding.

## Change log

| Date | Change |
|---|---|
| 2026-09-13 | Created. Timed exercises and the "what about tomorrow?" prompt, both specified in SPEC.md §7 before being built. |
