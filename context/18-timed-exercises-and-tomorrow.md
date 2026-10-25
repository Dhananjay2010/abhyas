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

## Verified on production

Deployed and driven through the real app, signed in, against the real database.
Five bugs were found in the process; each is described below and was fixed and
redeployed before carrying on.

**Timed exercises.** Block 12's Sunday Legs day ends with **Plank, 3 × 20–40s**
on Today — a time range, not 8–12 reps. In the session it shows a **"Hold for
40s"** button; the countdown ran, and all three ways of recording a hold were
exercised: stopped early at **19s**, run to zero for the full **40s**, and
typed by hand as **35s**. The set list read `19s`, `40s`, `35s`, and the
database holds exactly that:

```
set 1: reps=NULL weight=NULL duration_seconds=19
set 2: reps=NULL weight=NULL duration_seconds=40
set 3: reps=NULL weight=NULL duration_seconds=35
```

Progression then said **"Staying at this hold length until every set reaches
the top of the range"** — correct, since 19 and 35 are short of 40, and worded
for a hold rather than a weight.

**The prompt.** Today offered *"You missed yesterday — Pull did not happen.
Today is Legs"*; swapping to Pull rewrote the day to Pull with the Pull day's
exercises, showed the explanatory note, and left "Your week" untouched. At the
end of the session the summary asked *"What about tomorrow? Tomorrow is Push"*,
and choosing Rest wrote exactly one row:

```
local_date 2026-09-14  status planned  planned_type rest  actual_type rest
program_day_id NULL  week_in_block 1  is_deload false
```

## What the live pass found

| | |
|---|---|
| **A completed yoga session made the day unplannable** | `planDay` refused any date with a completed session, so a six-minute breathing or yoga session in the morning meant "That day is already done" for the whole day. Only a `weights` or `bodyweight` session owns a day — which Today already knew, and this repeated the mistake in a new place. |
| **A started override stopped owning the day** | Reading only `planned` rows meant starting a swapped day and leaving it part-way flipped Today back to the block's label while the button still resumed the swapped session: the screen said Legs and gave you Pull. `resolveDay` and Today now treat `in_progress` the same as `planned`. |
| **"Resume session" for a day never started** | A day planned through the prompt is a session row with no `started_at`, and calling that a resume told the user they had left a workout half-done. The label now keys off `started_at`. |
| **The swap list was the alphabet** | `findAlternatives` sliced six rows off an unordered query, so a core slot with 57 eligible exercises offered the same six names beginning with A and B, every time, for everyone. Now ranked by the generator's own `score` with the mechanic of the exercise being replaced, and ties broken by a hash rather than the alphabet — because ranking alone just made it the first six A-to-C names instead. |
| **The generator was not actually deterministic** | `pickForSlot` draws one `rng()` per candidate in pool order, and the catalogue query had no `ORDER BY`. The same user and block number could be handed different plans, and the committed fixture (exported `order by slug`) disagreed with production. Caught by generating block 8 both ways for the same profile: the first four exercises of Sunday matched exactly and the fifth did not. Now ordered by slug, and local and production agree. |

That last one is the reason this pass was worth running at all: the generator
tests were passing against an ordering production did not share.

## Known gaps

- **Today rendering an override on the following day has not been watched.**
  Tomorrow was set to rest and the row is correct, but nobody has yet seen
  Today render it on the day itself — that needs a calendar day to pass.
- **Changing a choice from Today is not possible.** Once a day is planned, the
  prompt is replaced by the explanatory note, and the "Change it" link only
  lives in the client state of the render that made the choice. Reload and
  there is no way back to the three buttons.
- A hold that reaches the top of its range on every set was not seen
  progressing on production — the three sets were 19, 40 and 35, so it held.
  The `+5s` path is covered by `npm run test:progression`.
- Only six exercises are holds, because that is all this catalogue has. Wall
  sits, dead hangs, L-sits and carries are absent and would need seeding.

## Change log

| Date | Change |
|---|---|
| 2026-09-13 | Created. Timed exercises and the "what about tomorrow?" prompt, both specified in SPEC.md §7 before being built. |
| 2026-09-13 | Verified end to end on production. Five bugs found and fixed while doing so: planDay blocked by a completed yoga session, a started override no longer owning the day, "Resume" on a day never started, the swap list being alphabetical, and the generator's catalogue query having no ORDER BY. |
| 2026-09-13 | **A session now records the unit it was run in.** `session_exercises.metric` is stamped when the session is built and carried through a swap; Today, History detail, the runner and `applyProgression` all read it instead of `exercises.metric`. See below. |

## The unit belongs to the session, not to the catalogue

*Added 2026-09-13, migration `20260921090000_session_exercise_metric.sql`.*

`exercises.metric` says what an exercise is **today**. Everywhere a past session
is displayed or scored, the question is what it was **then**, and the two
diverge in three ways:

1. Every session logged before this feature existed was prescribed in reps.
   Today rendered such a plank as "2 × 8–12s" — a range set in reps, relabelled
   by a column that did not exist when it was written.
2. Re-tagging any exercise later would rewrite the unit on every session of it
   already in History. That is not a migration artefact; it is permanent.
3. A mid-session swap can change the unit, because the alternatives offered for
   a core slot include holds — deliberately, since making a plank reachable from
   the swap list was the point of ranking that list.

So `session_exercises.metric` is written at session build time — in both
`startSession` and `ensureSessionExercises`, from the plan's own exercise — and
updated by `swapExercise`. The read sites are `today/page.tsx` (the "what you
did" list), `history/[id]/page.tsx`, `session/[id]/page.tsx` (the runner's
exercises) and `applyProgression`. Scoring from the session's own metric matters
as much as displaying from it: reading a finished set of twelve reps through a
catalogue that has since been re-tagged would evaluate it as a twelve-second
hold.

**The backfill reads the sets, not the catalogue**, because the sets are the
only honest record of what a past session was: a row with any
`duration_seconds` was run in seconds, a row with no sets at all (a skipped
exercise) falls back to the exercise's current metric, and everything else keeps
the `reps` default it was logged in.

### A changed unit needs a changed range

`planned_reps_min/max` are the range *in the exercise's own metric*, so carrying
only the metric through a swap would have asked for an **eight-second plank**.
`swapExercise` re-prescribes the range from the goal's hold table — the same
`prescribe()` the generator uses — when and only when the metric changes. Sets
are left alone, including a deload week's reduction, because a swap is a
substitution inside the session rather than a re-planning of it.

The new range has to reach the runner without a refetch (it is mid-session), so
`swapExercise` returns `{ metric, repsMin, repsMax }` and the runner applies all
three. Verified in `/dev/session`, whose alternatives now include a hold for
exactly this: swapping a bench press at 4 × 8–12 reps for a Weighted Plank gives
**4 sets × 20–40s** and a **"Hold for 40s"** button.

### Verified on production

Migration applied, then deployed. The backfill separated the two metrics on the
one row where they genuinely differ:

```
session=reps  catalogue=seconds  Plank
session=reps  catalogue=reps     Bodyweight Squat, Flutter Kicks, ...
```

Today's list changed from `Plank 2 × 8–12s` to `Plank 2 × 8–12`, which is what
that session was actually prescribed as, and History detail still reads
`Set 1 · 10 reps` for it.

**The write path is not yet exercised on production.** Stamping happens when a
session is built, and the account's day already carries a completed session, so
the first real test is the next session start. The read path and the backfill
are confirmed; the embed the write depends on
(`exercises!program_day_exercises_exercise_id_fkey(metric)`) names the only
foreign key between those two tables, and Today already resolves the same
relationship as a nested embed, so the risk is low rather than zero.
