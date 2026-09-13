# 19 — Clearing the rest of QA pass 2

**Status:** done · **Date:** 2026-09-13

[QA pass 2](../QA-FINDINGS-2.md) left a tail of findings that were real bugs
rather than product decisions: a junk row per abandoned session, a rebuild that
invented a new block every time, a Today screen that described a plan rather
than a workout, a progression banner that followed the user around, and the
half of SPEC §7's summary — PRs — that had never been built.

This step closes all of them. What remains open in that document after this is
the part that is genuinely Dhananjay's call: the catalogue's coverage and
tagging (H2, H4), the scoring rule that penalises owning a gym (H3), rest-day
options (M6), session length driving volume (M7), and cool-down content (M8).

---

## What it delivers

| Finding | Was | Is |
|---|---|---|
| **M4** | Start → quit → start inserted a second `sessions` row per attempt; History showed four identical "Skipped" rows for one morning | The day's abandoned session is resumed, sets and all — one row per day |
| **M5** (rest) | The summary showed time, sets, exercises, volume. SPEC §7 also asks for "PRs hit" | A "Personal bests" section, listing only bests that were **beaten** |
| **M9** | "Rebuild this block" on Today fired on the first tap, full-width and accent-coloured, directly above Sign out | Both rebuild buttons explain what will happen and ask |
| **M10** | Every rebuild incremented the block number and reset `started_on`; three settings changes reached "Block 3", and one real account read "Block 23 · Week 1 of 4" | A rebuild keeps the block's number and start date. Only a rollover starts a new block |
| **Low** | Today listed the day's original plan after the session, including an exercise that was swapped away | Today lists what was actually trained, marking what was swapped in and what was skipped |
| **Low** | "Your week" rendered template labels only, so a choice made last night was invisible | An override shows on its own day, marked "your choice" |
| **Low** | The progression banner rendered `progressNotes[last]` forever — by exercise four it described exercise one | It appears on exactly the screen after the exercise it is about |
| **Low** | Injury severity (Current / Past) was distinguished by colour alone | `aria-pressed`, like every other toggle in that form |
| **Low** | "Deload week — weights held where they were" for people with no weights | Unloaded and timed work is told nothing moves |
| **Low** | Today promised a "15 min warm-up" the session does not build | The heading states the shape and claims no duration |
| — | The rest panel flashed `0:00` for one frame before its first tick | The remaining time is seeded when the rest starts |

---

## How each is implemented

### One session row per day — `src/app/session/actions.ts`

`abandonSession` writes `status = 'skipped'`, and `startSession` looked only for
`planned` or `in_progress`, so the next start took the insert path. The status
filter now includes `skipped`, and the row for today is chosen in two steps:

```ts
const existing =
  todayRows.find((s) => s.status === "planned" || s.status === "in_progress") ??
  todayRows.find((s) => s.status === "skipped" && ownsTheDay(s.actual_type));
```

`ownsTheDay` was a local closure inside `planDay`; it is now a module function,
because Today, `planDay` and `startSession` all have to agree on what a day's
workout is and the last time they disagreed a six-minute breathing session
spoke for the whole day.

**The clock is restamped when a skipped session is restarted.** Session length
is wall time since `started_at`, so keeping the original stamp across a quit at
7am and a restart at 1pm would have recorded a six-hour workout. Resuming an
`in_progress` session still keeps its stamp — that is the phone-locked-mid-set
case the clock is meant to survive.

### Personal bests — `src/lib/program/progression.ts`

`Decision` gained `personalBest: PersonalBest | null`, computed from the same
comparison that already maintained `best_weight_kg`, `best_reps` and
`best_e1rm`. A best is only reported when there was a previous one to beat:

```ts
const beat = (now: number | null, before: number | null) =>
  now !== null && before !== null && now > before;
```

That single guard is the whole of "a baseline is not a record". One line per
exercise, chosen by what the exercise is:

| | Reported |
|---|---|
| timed | longest hold |
| unloaded (`heaviest === 0`) | most reps |
| loaded | heaviest set, else best estimated 1RM |

The e1RM branch is not redundant with the weight branch: it catches more reps
at a weight already lifted, which is a real PR that a weight comparison alone
misses. `describePersonalBest` turns one into a sentence, so the phrasing is
unit-tested rather than living in JSX.

`applyProgression` passes it out through `ProgressionFeedback`, and
`session-runner.tsx` renders a "Personal bests" section above "What changed for
next time" — above, because it is the part a person wants to see.

### Rebuild versus rollover — `src/lib/program/persist.ts`

`createBlockForUser` takes `mode: "new" | "rebuild"`. A rebuild reads the
**active** program and keeps its `block_number` and `started_on`; a new block
increments the highest number and starts today. `buildPlan` — the action behind
both rebuild buttons — passes `"rebuild"`; rollover and onboarding do not.

A pleasant consequence: the generator is seeded on
`${userId}:${blockNumber}`, so a rebuild that changes no answers now produces
the same plan. Rebuilding is idempotent rather than a reshuffle.

A rebuild with no active block (the "Build my first block" path) falls through
to new-block numbering, so that route is unaffected.

### Guarded rebuild — `src/app/today/build-plan-button.tsx`

A two-step confirm in the component itself, so both call sites get it. The
first build passes `confirm={false}`: there is no plan to replace.

### What Today shows — `src/app/today/page.tsx`

Two changes, both about the screen telling the truth.

**The exercise list.** When a strength session for today has been started or
completed, the list is built from its `session_exercises` — which carry the
swaps and the skips — rather than from `program_day_exercises`. Both shapes are
normalised into one `TodayRow` type so the markup does not branch. A day merely
*planned* through "what about tomorrow?" has no session exercises yet and keeps
the template.

The fetch is a third wave, run only when a session exists, and it shares its
round trip with `plannableDays`, which is also conditional. The pre-session load
— the one people wait on — is unchanged.

**The week.** The sessions query was widened from `[yesterday, today]` to a
range covering the whole local week (plus yesterday, which is in last week when
today is a Monday). Overrides are collected into a `Map` keyed by weekday and
rendered in "Your week" as the chosen label with "your choice" underneath. Only
a difference is recorded: "keep the plan" writes no row, and a swap that matches
the template is not news.

This also made the tomorrow prompt **verifiable the same day**. Until now the
only way to see that an override had landed was to wait for the date to arrive.

### The banner — `src/app/session/[id]/session-runner.tsx`

`bannerFor` holds the exercise index the note belongs on, set to the index being
moved to when an exercise finishes. The banner renders on
`bannerFor === exerciseIndex`. `progressNotes` still accumulates everything for
the summary.

---

## Verified

Run locally against `/dev/session`, which mounts the real `SessionRunner`:

- Nine sets across three exercises. The banner showed **Bench Press** on
  exercise 2 and **Lat Pulldown** on exercise 3 — the exercise just finished,
  never one before that.
- The summary rendered "PERSONAL BEST · Barbell Bench Press · Heaviest set yet
  — 60 kg" above the three progression notes, with the heading in the singular
  for one.
- The rest panel read `0:08` the instant a set was logged. Before the fix the
  same check caught it reading `0:00`.
- Reps and weight both carry forward from the previous set (12 / 60), and the
  first set of an exercise starts empty. That behaviour is unchanged and was
  re-confirmed rather than assumed.

`scripts/test-progression.ts` gained twelve checks covering personal bests: a
heavier set, repeating a best, a first session, more reps at the same weight,
unloaded reps, a longer hold, a deload week, and both deload wordings. Full
suite passes; `npm run build` and `eslint --max-warnings=0` are clean.

**Not verifiable locally:** everything on Today, which needs a signed-in account
against the real database. Verified on production — see the change log.

---

## What the live pass found

Three of the changes above were wrong in ways local verification could not show,
and all three were caught within minutes of opening the deployed app:

- **"Your week" was keyed to the calendar week.** Today was a Sunday, so every
  row in the list was a day that had already happened and tomorrow — the one day
  a choice had just been made about — was outside the window entirely. Each row
  now means that weekday's **next** occurrence, which is today for today. The
  bug needed a Sunday to appear; any other day of the week would have hidden it.
- **The wrong session's exercises.** The account carried four strength rows for
  the day (one completed, three abandoned — the very junk M4 describes), and
  `find` returned an abandoned one, so an abandoned session's exercises rendered
  under "Session complete. Well done." The completed session is now preferred.
  A tidy account would never have shown this.
- **History listed tomorrow.** "Rest · Mon 14 Sept · Not started" sat at the top
  of "your last 6 sessions". The tomorrow prompt writes a `sessions` row dated
  tomorrow, and History has no date filter — the user's timezone arrives with
  the profile in the same wave as the query, so the filter is applied in code
  rather than serialising the two.

- **A day stopped being named once its session ended.** Today resolved the day
  from a `planned` or `in_progress` row only, which was fine while an abandoned
  session was never resumed and a finished one was never listed. Both changed
  today: finishing a swapped Pull day reverted the header to the block's "Legs"
  above a list of the Pull exercises actually done, and abandoning one left
  "Legs" on screen while Start resumed Pull. `ownsToday` now covers planned,
  in-progress, completed and abandoned rows — yoga and breathing excluded in
  every state but `planned` — and a rank picks between them: finished beats
  under way beats intended beats abandoned. `performed` is derived from the same
  row, so the header and the list can no longer disagree.

## Verified on production

- `Block 12 · Week 1 of 4`, rebuilt through the guarded button on Today: the
  confirmation appeared, and afterwards the block was **still 12**, still
  `started_on 2026-09-13 → ends_on 2026-10-10`, and the Legs day came back
  exercise-for-exercise identical — `squats-with-bands`,
  `smith-machine-stiff-legged-deadlift`, `barbell-walking-lunge`,
  `rocking-standing-calf-raise`, `plank`. Before this change the same tap would
  have produced block 13 starting today.
- Today's list read "What you did", with `Squats - With Bands`,
  `Hip Extension with Bands`, `Barbell Walking Lunge` and
  `Rocking Standing Calf Raise` struck through and marked SKIPPED, and
  `Plank 3 × 20–40s` left standing — which is exactly the session that was run.
- "Your week" showed **Monday · Rest · your choice**, the override written by
  the tomorrow prompt the evening before.
- `aria-pressed` on the injury severity pair reads `true` / `false`.
- History stopped listing tomorrow: "your last **6** sessions", headed by
  "Rest · Mon 14 Sept · Not started", became "your last **5**" with nothing in
  it that had not happened.
- A settings write survives a reload — "Log every set" off, reload, still off,
  `per_set_logging = false` in the database, then back on. That is [M3](../QA-FINDINGS-2.md)'s
  silent-no-op fix confirmed on the deployed app rather than in review.
- At 390 × 844: no horizontal overflow, the struck-through SKIPPED rows read
  clearly, and "Rest / your choice" sits right-aligned on two lines without
  crowding the weekday.
- `/dev/*` is not reachable in production — 307 to `/` signed out, 404 signed
  in. Worth stating because those harnesses ship in the bundle.
- `/onboarding` with a finished profile redirects to Today.

### M4 and the resume, on production

Both needed a day with no completed session on it, so Dhananjay marked the
day's session abandoned and the account was left carrying **four** abandoned
strength rows for one date — exactly the mess M4 describes, which made it a
better test than a clean account would have been.

Today read `Legs`, `Start session` (not "Resume" — nothing was under way) and
`Where you got to` above the five exercises of the newest abandoned attempt.
Pressing Start:

```
before:  4 rows   5c2b65d9  skipped      started_at 06:30:22
after:   4 rows   5c2b65d9  in_progress  started_at 10:42:04
```

No fifth row — before the fix that tap inserted one and stranded the three
Plank sets in the row it walked away from. `started_at` restamped rather than
carried, so the session clock started at zero instead of claiming four hours.

And it opened on the **cool-down**, not on exercise one offering "How did that
feel?" for a lift finished that morning — the double-progression fix, on the
only account that could reach that state. Finishing from there recorded
`completed`, `duration 34s`, three sets, "1 of 5 exercises", no progression
notes and no personal bests, which is right: nothing was finished on that
visit. The tomorrow prompt read "Tomorrow is **Rest**" — the override already
written, not the block's Push. Back on Today the heading had changed from
"Where you got to" to "What you did".

### Modes nothing had ever run

`/dev/session` gained three switches — per-set logging, cool-down, and "start
finished" — because the modes behind them change the session flow and none of
them could be reached on the account: exercising them on production needs a day
with no completed session on it. They are client settings, so the harness can
reach what the account cannot.

Driving per-set logging off found the one real problem: the fields disappear and
the button becomes "Set 1 done", which is right, but a set is then stored with
every value null. Progression reads that as `no_data` and says "No reps
recorded, so nothing changed" — on every exercise, of every session, to someone
who turned the numbers off deliberately. `applyProgression` now returns no
feedback for that exact combination, while still writing the progress row.

What it did **not** find, which is worth stating because it is the failure that
would have mattered: ticking sets off is not read as a missed session.
`consecutiveFailures` stays where it was, so two tick-off sessions in a row do
not drop the working weight by ten percent. There is now a test for that.

"Start finished" reproduces the resume state locally: it opens on the cool-down
and skips the warm-up, which is right — nobody should be asked to warm up for a
session they have finished — and completing from there reports "2 of 3
exercises", no progression notes and no personal bests.

## Still not verified on production

Daily-menu mode, and the abandon-then-restart loop in one continuous pass. Both
need a day carrying no completed session. Tomorrow is planned as Rest and has
none, so it is the day to do it on.

## Known gaps

- **Session duration after an abandon is the second attempt only.** The first
  attempt's minutes are not added back. Any answer here is a guess; this one is
  at least never absurd.
- **A rebuild in week 3 keeps the deload in week 4**, which is the point, but it
  also means the fresh exercises get one to three weeks rather than four before
  the block rolls. That is the honest consequence of not moving the dates.
- The "Your week" override marker shows planned and in-progress days. A day
  already **completed** is not marked as done, so the week still does not say
  what you have actually trained this week.
