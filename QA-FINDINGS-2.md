# QA pass 2 — 2026-09-13 — the whole app except Breathe

> In progress. A full end-to-end pass as a brand new user, against
> **production** (https://abhyas-indol.vercel.app) with a real signed-in
> account, which is what the [first QA pass](QA-FINDINGS.md) could not do.
> Breathe was excluded at Dhananjay's request — he has tested it thoroughly.

## How this was tested

The account for `dhananjay.rtr@gmail.com` was wiped in Supabase (all rows in
every user table, `profiles` reset to a blank onboarding), so onboarding ran
from the first screen exactly as a new signup would. Everything below was then
driven through the real UI in Chrome against production: real Google session,
real server actions, real database.

Two things were exercised outside the browser, and both are named as such where
they appear:

- `scripts/qa/repro-week.ts` and `scripts/qa/repro-pools.ts` run the **real**
  `generateProgram` / `isEligible` against the committed catalogue export, to
  see all seven days of a week at once. Today only ever renders one day, so
  there is no way to inspect the rest of the block through the UI. The
  generated day-7 output was checked against what production actually built
  for the same profile, and matched in structure, so the harness is faithful.
- The set-logging race conditions were re-tested with `window.fetch` wrapped to
  add 1500 ms to every POST, reproducing the slow-server conditions under which
  the original H1 was found.

**Not covered:** real iOS Safari (wake lock, vibration, audio unlock, PWA
install), which SPEC §15 calls mandatory and which cannot be done from here;
the Google OAuth screens; and the Breathe tab.

---

## Verified fixed from the first pass

Re-tested against the real server, not the `/dev` harnesses:

| | |
|---|---|
| **H1 / H2** — double-tap loses a set | **Fixed.** Three rapid taps on "Log set" with POSTs delayed 1500 ms produced exactly one set. Every async button (`Undo`, the three feel buttons, `Skip this exercise`, `End session early`) is `disabled` for the whole round trip. |
| **H3** — `logSet` validates nothing | **Fixed.** `0` reps → "A set needs at least one rep. Skip the set instead." `-50` kg → "Weight cannot be negative." `999` reps → "That is more than 100 reps — please check." `99999` kg → "Weight should be 500 kg or less." |
| **M1** — reps prefilled at top of range | **Fixed for the first set** — the field starts empty with "Enter the reps you did." See F9 for what it does on later sets. |
| **M2** — a logged set cannot be corrected | **Fixed.** "Undo" appears on the most recently logged set and removes it. |
| **M4** — Skip has no confirmation | **Fixed.** "Skip Flutter Kicks? You will not be able to come back to it in this session." |
| Onboarding validation | **Holds.** Under-16 date of birth, a future date of birth, height 320 cm and weight 600 kg are all rejected with specific messages. Continue is disabled until each step is answered. |

Also healthy: the swap flow, the progression messages, the History detail page
(which correctly shows "swapped in", "skipped" and the per-exercise feel), body
weight validation and same-day upsert, and the Settings → "Rebuild my block"
confirmation banner.

---

## High

### H1 — The rest timer freezes on screen and will not go away  *(fixed)*

**Reproduced in production, every time.** Log a set, then tap **Skip** on the
rest panel. The countdown stops on whatever second it had reached and the panel
stays there for the rest of the exercise. Measured live: session clock ran
3:19 → 3:24 while the rest timer sat on `1:13`, and it was still `1:13` half a
minute later.

It is not only the Skip button. `restEndsAt` is cleared in four places, and
three of them leave the panel stuck:

| Action | What the user sees |
|---|---|
| **Skip** on the rest panel | Countdown freezes, panel never closes |
| **Undo** the last set | Same |
| Finishing an exercise (the feel tap) | Every exercise after the first opens with a dead timer |
| Reaching 0:00 naturally | Correct — this is the one path that works |

The cause is one line. The panel rendered on `restRemaining > 0`, but the
effect that maintains `restRemaining` begins `if (restEndsAt === null) return;`
— so clearing the end time stops the interval without ever zeroing the number
the panel is keyed off. Only the natural-expiry path sets the number to 0
first, which is why that one case looked right.

This is on the control a person touches most often in a workout, and because it
also fires at every exercise transition, a normal five-exercise session shows a
wrong, frozen rest time for most of its length.

**Fixed** in `session-runner.tsx` by rendering the panel on `restEndsAt !== null`
— the state that actually means "a rest is running" — rather than on a derived
counter. Verified in `/dev/session`, which mounts the real `SessionRunner`:
Skip at `0:07` now closes the panel immediately, and the exercise transition
leaves nothing behind. (The fix is entirely client-side state, so the harness
exercises the real code path; it could not be re-checked against production
because a completed session for today blocks starting another.)

### H2 — Whole days of the plan contain none of the movement they are named after

A "Pull" day with no pulling movement in it, still labelled Pull. This is the
single worst thing I found, because the plan is the product.

Reproduced by running the **real** `generateProgram` over the committed
catalogue for a bodyweight-at-home beginner with no equipment — the default
"At home" path:

```
day 2  Pull  (4 exercises)
    3x8-12  core     3/4 Sit-Up
    3x8-12  cardio   Air Bike
    3x8-12  core     Bent-Knee Hip Raise
    3x8-12  squat    Bodyweight Squat
day 6  Pull  (4 exercises)
    3x8-12  core     Bottoms Up
    3x8-12  core     Butt-Ups
    3x8-12  core     Cocoons
    3x8-12  core     Cross-Body Crunch
```

Four core exercises under the heading "Pull". The mechanism: with no equipment
the eligible pool has **zero** exercises for `vertical_pull`, `horizontal_pull`,
`calf`, `biceps`, `rear_delt` and `lateral_delt`. Every slot on a Pull day
misses, including the `PATTERN_FALLBACK` alternatives, so `exercises.length`
is 0 and the empty-day backfill takes over — and the backfill takes the four
highest-scoring *unused* exercises of any kind while the day keeps its template
label.

Coverage measured across realistic profiles (`scripts/qa/repro-pools2.ts`):

| Profile | Eligible | Patterns with nothing |
|---|---|---|
| home bodyweight, no equipment | 55 / 604 | vertical_pull, horizontal_pull, **vertical_press**, calf, biceps, rear_delt, lateral_delt |
| home bodyweight, + pull-up bar | 58 / 604 | horizontal_pull, vertical_press, calf, biceps, rear_delt, lateral_delt |
| gym, yoga mat only | 55 / 604 | same as no equipment |
| gym, dumbbells + flat bench | 124 / 604 | vertical_pull |
| gym, everything, current knee injury | 350 / 604 | lunge |
| gym, everything, beginner | 375 / 604 | — |
| gym, everything, intermediate | 573 / 604 | — |

Seven of thirteen patterns are unreachable for a home user with no equipment.
There is no equipment-free **vertical press** either — pike and decline push-ups
are the standard answer and are not in the seed — so that track cannot train
shoulders overhead any more than it can train back.

Two separate things are wrong:

1. **The catalogue has no equipment-free horizontal pull at all.** Inverted
   rows / table rows / towel rows are the standard answer and are simply not in
   the seed. Until they are, the bodyweight track cannot train back.
2. **A day that gets backfilled keeps a name it has not earned.** *(fixed)* —
   `generate.ts` now labels a backfilled day "Full body" instead of "Pull" or
   "Legs". That stops the app lying about the day; it does not create the
   missing exercises, which is a catalogue job and your call.

The same starvation produced the Legs day on your pre-reset account: block 23,
Sunday, with a current knee injury, was **Flutter Kicks, Oblique Crunches and
Crunch - Legs On Exercise Ball** — three ab exercises on a leg day.

### H3 — The main lifts are chosen by a rule that penalises having a gym

For a user who selects "At a gym" and "I have access to everything", with
muscle gain as the goal, the real generator picks:

```
day 1  Push   slot 1: Push-Ups With Feet Elevated
day 2  Pull   slot 1: Overhead Slam        (medicine ball)
day 7  Legs   slot 1: Rocket Jump          (plyometric)
```

Bench press, a row and a squat are all available and all lose. `score()` ends
with `s -= Math.max(0, ex.equipment_ids.length - 1)`, so an exercise needing no
equipment scores a full point above one needing a barbell, and two above a
bench-plus-dumbbell movement. "Prefer the simplest setup that does the job" is
a reasonable instinct for a home user and exactly backwards for someone who
just told us they train in a fully equipped gym.

It compounds with **H4**: the mis-tagged novelty movements are precisely the
ones that win, because they are tagged `compound` in a pattern where the real
compounds are being penalised for needing a barbell.

Not fixed — the scoring change is a product decision (suppress the penalty when
`primaryTrack === "weights"`, or weight it by how much equipment the user has),
and it changes every plan the app generates.

### H4 — Catalogue movement patterns and mechanics are wrong often enough to matter

`movement_pattern`, `mechanic` and the `cue` text are all derived by rules in
`scripts/build_exercise_seed.py` rather than curated, and the derivation is
wrong in ways that feed straight into slot selection:

| Exercise | Tagged as | Actually |
|---|---|---|
| Flutter Kicks | `hinge` · compound · glutes | an ab exercise |
| Double / Single Leg Butt Kick | `squat` · compound · quads | a running drill for hamstrings |
| Overhead Slam | `vertical_pull` · compound · lats | a medicine-ball power throw |
| Lying Cambered Barbell Row | `horizontal_pull` · **isolation** | a compound row |
| Back Flyes - With Bands | `horizontal_press` | a rear-delt pull |
| Backward Medicine Ball Throw | `vertical_press` | a throw |

Because `pickForSlot` puts compounds in the first two slots of every day, a
mis-tagged compound goes straight into a main-lift position. "Flutter Kicks" as
the main hinge on a leg day is exactly this.

The generated `cue` text is visible to the user and inherits the same errors —
Back Flyes reads "Compound **pull** movement" while sitting in a **press**
pattern, and the app told me Flutter Kicks was a "Compound pull movement
targeting glutes."

Not fixed: this is a data-curation pass over 604 rows, not a code change.

---

## Medium

### M1 — Isometric exercises are prescribed and logged in reps  *(fixed and verified live)*

Today's plan contained **Plank — 2 sets × 8–12 reps**, with a Reps field, a
Weight (kg) field and the prompt "Enter the reps you did." There is no way to
record a 45-second hold, so the user has to invent a number, and that invented
number then drives progression.

The schema has no concept of a timed exercise — `exercises` has sets, reps and
rest, and nothing else. At least sixteen catalogue entries are holds or carries
by name (Plank, Side Bridge, Isometric Chest Squeezes, Isometric Wipers, the
neck isometrics, the glute bridges), and every one of them gets a rep target.

**Fixed.** `exercises.metric` (`reps` | `seconds`) now says which unit an
exercise is measured in, curated per row rather than guessed from the name. A
hold is prescribed as a time range by goal, run as an on-screen countdown that
beeps and vibrates like the rest timer, and logged in
`session_sets.duration_seconds`. Progression became double progression on time,
+5 s a step, moving to a harder variation at 120 s. See
[context/18](context/18-timed-exercises-and-tomorrow.md).

### M2 — The warm-up ignored the equipment list  *(fixed)*

The first warm-up item of my session was **"Easy stationary bike · 5 min"** for
a user whose entire equipment list was a yoga mat — directly contradicting the
line on the equipment screen, "We never suggest an exercise you have no
equipment for."

`selectWarmup` declares `availableEquipment: Set<string> | null` in its input
type and the caller in `session/[id]/page.tsx` builds it correctly, but the
function never destructures it. The cardio choice was made from `track` alone,
so every weights user got the bike first.

**Fixed** in `warmup.ts`: a slug → equipment map (`easy-bike` →
`stationary_bike`, `easy-row` → `rowing_machine`, `skipping-light` →
`jump_rope`) now filters the preference list. Brisk walk and marching in place
need nothing, so there is always a fallback.

### M3 — A settings write can report success while changing nothing  *(fixed)*

`updateSessionSettings` did a plain `.update()` on `user_settings`. PostgREST
treats an update matching zero rows as success, so the action returned `ok`,
the toggle moved on screen, and the change was gone on the next load with no
error shown anywhere.

**How I hit it, honestly:** my own reset script deleted the `user_settings`
row, and nothing in the app recreates it — the row is only ever created by the
`on_auth_user_created` trigger, which fires on signup. So a genuine new user
does **not** hit this. What the episode exposes is real anyway: the app assumes
a row that no code path guarantees, and when the assumption breaks it fails
silently rather than loudly. Every "During a session" setting **and every
Breathe preference** were affected, because `breathe/actions.ts` wrote the same
way.

Confirmed by contrast, live: with the row missing, "Session length 45m" (a
`profiles` write) persisted across a reload while "Log every set" and the
weigh-in reminder (both `user_settings` writes) reverted every time.

**Fixed**: both `settings/actions.ts` and `breathe/actions.ts` now `upsert`
on `user_id`. You still need to run `restore-user-settings.sql` once for your
own account, since the fix is not deployed yet.

### M4 — Abandoning a session leaves a junk row, and starting again makes another  *(fixed)*

`startSession` reuses an existing session only when its status is `planned` or
`in_progress`. `abandonSession` sets it to `skipped`, which is in neither list,
so the next "Start session" inserts a **new** row for the same `local_date`.
Today then shows "Start session" again, because `strengthDone` only looks for
`completed`.

Start → exit → start → exit leaves one "Skipped" entry in History per attempt.
Your pre-reset History had exactly this: **four identical "Push · Thu 10 Sept ·
Skipped" rows**, which is what led me to the code path. I could not re-trigger
it after the reset because a completed session for today blocks a restart.

**Fixed.** `startSession` now reuses an abandoned strength session for today
instead of inserting a second row, so the day keeps one entry and the sets
logged before walking away come back with it. The session clock is restamped on
a deliberate restart — carrying the original stamp across a quit at 7am and a
restart at 1pm would have recorded a six-hour workout — while an `in_progress`
resume keeps its clock, which is the phone-locked-mid-set case.

### M5 — The session summary is missing what the spec promises  *(fixed)*

SPEC §7 says the summary shows "duration, total volume, PRs hit". It shows
Time, Sets logged, Exercises, and Total volume **only when volume > 0** (so a
bodyweight session correctly hides it — that part is right). **PRs are not
shown at all**, even though `exercise_progress.best_weight_kg` and `best_e1rm`
are maintained on every set.

The **"What about tomorrow?" prompt was absent entirely** — *keep the plan ·
swap the day · rest*, which SPEC §7 calls "what makes the plan feel like
yours", along with its "if a day is missed, the same prompt appears on next
open". Searching the whole app for it found hits only inside Breathe, and the
session ended at "Back to Today".

**Fixed, both parts.** The prompt closes every session, and Today asks the same
question about today when yesterday was a training day nobody finished. A choice
is a one-day override that Today honours; nothing about the block shifts. See
[context/18](context/18-timed-exercises-and-tomorrow.md).

**PRs now exist too**: a "Personal bests" section above "what changed for next
time", listing only bests that were **beaten** — a first session sets a baseline
and claims no record. The longest hold for timed work, the most reps for
unloaded work, the heaviest set or the best estimated 1RM for loaded work, one
line per exercise. See [context/19](context/19-qa-pass-2-remainder.md).

### M6 — Rest days offer nothing, and cannot be overridden

SPEC §8: "The engine schedules them, the user overrides them. A rest day still
shows options: full rest, active recovery (mobility flow), yoga, or meditation.
Nothing is forced."

What a rest day actually renders is one sentence — "Nothing scheduled. Rest
properly, or do something light." — plus the Yoga and Breathing links that
appear on every day anyway. There is no active-recovery flow (the
`active_recovery` day type exists in the schema and is never produced or
offered) and no way to say "I want to train today".

This is the **first screen a new user sees** if they sign up on a rest day,
which is what happened to me: onboarding finished on a Sunday, and the app's
opening move was "Nothing scheduled."

### M7 — Session length is a setting that does nothing

Settings offers 30m / 45m / 60m / 75m and stores `preferred_session_minutes`.
Nothing reads it: the only references in the whole of `src/` are the Settings
page writing it and reading it back. The generator does not consult it, so the
number of exercises and sets is identical at 30m and 75m.

Related: the session promised "15 min warm-up" on Today, while the warm-up it
builds is 5 + 1 + 1 + 1 + 1 = **9 minutes**, and there is no ramp-up-sets phase
(SPEC §7's third warm-up component). A beginner on general fitness gets 2 sets
per exercise, so the whole "one hour" framing — the app's defining constraint —
is not enforced anywhere.

*(The heading is fixed — it no longer claims a duration the app does not build.
The setting doing nothing is the finding, and it stands.)*

### M8 — Warm-up and cool-down items have no timer, and the cool-down is the warm-up again

Each warm-up screen states a duration ("5 min", "1 min") and nothing counts it
down; the only clock is total elapsed. SPEC §7 describes the session as
"screen-by-screen, timer-driven", and the rest timer between sets is the only
timer that exists.

The cool-down is worse: it renders `warmup.filter(w => w.phase === "mobility")`
— literally the same four items the user did as their warm-up — under the
instruction "Hold each for about 30 seconds". Mine listed Bodyweight squat,
Walking lunge, Cat-cow and Glute bridge, none of which is a static stretch and
none of which can be held for 30 seconds. There is no stretch data to draw on:
`warmup_exercises` is seeded with `cardio`, `mobility` and `prehab` only.

### M9 — "Rebuild this block" on Today is unguarded  *(fixed)*

Settings guards a rebuild behind an explanatory banner — "Your plan no longer
matches these answers. Rebuilding keeps every session you have already logged."
— and a deliberate second tap. Today offers the same operation as
`BuildPlanButton`, a **full-width accent-coloured primary button** at the
bottom of the page, directly above Sign out, that fires `buildPlan()` on the
first tap with no confirmation and no explanation of what it will do.

It discards the current block's exercise selection, resets `started_on` to
today (so the deload week moves) and increments the block number. Nothing is
lost from history, but it is the most consequential control on the screen and
it is the least protected one.

**Fixed.** The confirmation lives in `BuildPlanButton`, so both callers get it:
it says what a rebuild changes and what it keeps, and asks. "Build my first
block" opts out — there is no plan to replace. (And after M10, a rebuild no
longer moves the deload week or the block number at all.)

### M10 — The block number increments on every rebuild  *(fixed)*

`createBlockForUser` sets `blockNumber = (last block_number ?? 0) + 1` and runs
on every "Rebuild this block" and every goal / level / days / equipment change,
each time also resetting `started_on` to today. Three settings changes during
this session took a brand-new account from "Block 1" to "Block 3"; your
pre-reset account was showing **"Block 23 · Week 1 of 4"**, implying 92 weeks
of training.

SPEC §6 increments the block at the end of four weeks. A rebuild is a
re-plan of the current block, not a new one.

**Fixed.** `createBlockForUser` takes a `mode`: a rollover starts a new block
and a rebuild keeps the active block's number and `started_on`. Since the
generator is seeded on `${userId}:${blockNumber}`, rebuilding with unchanged
answers now returns the same plan rather than reshuffling it.

---

## Low

- **"Full body, 1 times a week"** *(fixed)* — the yoga-days step offered
  "Full body, 2 times a week" and "Full body, 1 times a week" next to a
  correctly worded "Full body, three times a week". `SPLIT_BY_DAYS` had no
  entries for 1 and 2, so the template fallback showed through. Added both.
- **"Best streak · 1 sessions"** *(fixed)* — Progress pluralised the current
  streak correctly and hard-coded `sub="sessions"` for the best one.
- **Progression messages say "weight" for bodyweight work** *(fixed)* — "Staying
  at this weight until every set reaches the top of the range" appeared for
  Single Leg Butt Kick and for Plank, neither of which has a weight. A hold is
  now told about its hold length, unloaded work is told "staying here", and the
  deload message no longer tells someone with no weights that their weights are
  held.
- **Injury severity toggles have no `aria-pressed`** *(fixed)* — every other
  toggle in `settings-form.tsx` has one. The Current/Past pair was styled-only,
  so a screen reader could not tell which was selected.
- **The weight field leaked between exercises** *(fixed)* — `SetEntry` was
  keyed on the set number alone, so moving from one exercise to the next at the
  same set number reused the component and kept its state: the 60 kg typed for
  the bench press was still in the box on the lat pulldown, one tap from being
  logged against it and fed to progression. Found while verifying the new hold
  UI, where a stale weight appeared on a plank.
- **Undoing a set leaves the rest timer running** *(fixed by H1)* — `onUndoSet`
  already cleared `restEndsAt`; the panel kept counting only because it rendered
  off the derived number. Rendering on `restEndsAt` closed both. Re-checked
  rather than assumed.
- **Today still lists the original plan after a session** *(fixed)* — after
  completing a session in which I swapped Double Leg Butt Kick for Bodyweight
  Squat, Today showed "Session complete. Well done." above the *unmodified*
  original five exercises, including the one I swapped away. Once a session has
  been started, Today now lists that session's own exercises under "What you
  did", marking what was swapped in and striking through what was skipped.
- **A progression banner persists onto later exercises** *(fixed)* —
  "Bodyweight Squat: Every set at the top of the range…" was still on screen two
  exercises later. The note now appears on exactly the screen following the
  exercise it describes.
- **No way to see any day but today** *(partly addressed)* — Today lists the
  week as labels only, so a new user who lands on a rest day cannot look at what
  the week holds. The week list now at least shows one-day overrides on the days
  they apply to, marked "your choice", so a decision made last night is visible
  this morning. Seeing another day's *exercises* still is not possible.
- **Cold loads are slow** — a warm Today renders in ~370 ms and all six routes
  answered in 115–200 ms when measured directly, but the first load after a
  cold function sat on "Loading today's plan…" for well over ten seconds. The
  bottom nav prefetches all five tabs on every page, so each visit fans out
  into four extra RSC renders, each re-running that route's queries.

---

## Found while verifying the fixes on production (2026-09-13, all fixed)

Deploying the two new features and driving them for real turned up five more,
none of which any amount of local testing would have shown:

- **A completed yoga session made the whole day unplannable.** `planDay`
  refused any date carrying a completed session, so a six-minute breathing
  session in the morning answered "That day is already done" to every attempt
  to plan or swap that day. Only a `weights` or `bodyweight` session owns a
  day — which `today/page.tsx` already knew, with a comment about a breathing
  session hiding the Start button for the rest of the day. The new action
  repeated the same mistake in a new place.
- **A started override stopped owning the day.** Starting a swapped day and
  leaving it part-way flipped Today back to the block's label while "Resume
  session" still resumed the swapped one: the screen said Legs and the button
  gave you Pull.
- **"Resume session" on a day that was never started**, because a day planned
  through the prompt is a session row with no `started_at`.
- **The swap list was, in effect, the alphabet.** `findAlternatives` sliced six
  rows off a query with no ordering, so a core slot with 57 eligible exercises
  offered the same six names beginning with A and B — every time, for every
  user, and nothing later in the alphabet was reachable at all. This is also
  why the yoga-mat account earlier in this pass was offered six jump variants.
- **The generator was not deterministic, despite saying so.** `pickForSlot`
  draws one `rng()` per candidate in pool order and the catalogue query had no
  `ORDER BY`, so the same user and block number could produce different plans,
  and the committed fixture disagreed with production. Caught by generating the
  same block locally and on production and finding four of five exercises
  identical and the fifth not. **The generator tests were passing against an
  ordering production did not share** — which is the strongest argument in this
  document for testing against the real thing.

---

## Found while clearing the tail (2026-09-13)

One more, found by driving the real `SessionRunner` locally rather than by
reading it:

- **The rest panel flashed `0:00` before its first tick.** The H1 fix moved the
  panel onto `restEndsAt !== null`, which is correct, but React effects run
  after paint — so the frame between logging a set and the effect's first tick
  rendered a rest timer that had apparently already finished. Seeded at the
  moment the rest starts, where the remaining time is known exactly. A one-frame
  bug is still a bug on the control a person touches most in a workout.

---

## Checked and healthy

- **Access control.** `/history/<someone-else's-uuid>`, `/session/<unknown>`
  and `/history/not-a-uuid` all return a clean 404 — no leak, and a malformed
  UUID does not reach Postgres as a cast error.
- **Auth, end to end.** Sign out returns to a well-judged landing page (the
  proposition, three bullets, the disclaimer, one button). While signed out,
  every one of `/today`, `/history`, `/progress`, `/settings`, `/breathe`,
  `/yoga` and `/onboarding` redirects to `/` with no data in the response.
  "Continue with Google" then signs back in through the account chooser and
  lands on Today with everything intact.
- **Onboarding validation**, end to end: under-16 and future dates of birth,
  height 320 cm, weight 600 kg, and a disabled Continue on every unanswered
  step.
- **Set logging**: 0 reps, negative weight, 999 reps and 99999 kg all rejected
  with specific messages; triple-tapping "Log set" with a 1500 ms server delay
  wrote exactly one set; every async control disables for the round trip.
- **Undo** removes the set and restores the counter and the Swap button.
- **Swap** offered six same-pattern alternatives and applied cleanly mid-session.
- **Progression**, live: three sets at the top of the range produced "target
  goes up to 14 reps" for a bodyweight movement; three sets below it produced
  the hold message. Both match SPEC §6.
- **History detail** is genuinely good — per-set rows, "swapped in", "skipped",
  the per-exercise feel, and "—" for a session with no load.
- **Body weight**: rejects 5 kg, upserts within the same day rather than
  stacking entries, and the single-entry empty state reads well.
- **Yoga**: nine playlists, the embed loads with its "Open on YouTube"
  fallback and attribution, "I did this" advances the series and records
  1 of 31, and it writes its own session that History shows separately.
- **Days trained** counted 1 for a day with both a weights and a yoga session,
  which is right.
- **Settings → rebuild** shows the confirmation SPEC §13 asks for, and the
  rebuilt plan reflected the change both times (4 → 6 days, then yoga mat →
  full gym, which turned a Legs day of butt kicks and crunches into Hack Squat,
  Cable Deadlifts, Step-up with Knee Raise, Standing Calf Raises and Crunches).
- **Mobile layout** at 375 × 812: no horizontal overflow on the session,
  settings, charts or onboarding screens; large type and full-width tap targets.
- **Server health.** The Chrome extension's network panel reported a run of
  503s on server actions. Vercel's own logs for the same window show 98× 200
  and 2× 404 (a probe of mine) and **no 503 at all**, so that was an artefact
  of the instrumentation, not the app. Worth recording so it is not chased
  again.

---

## What I could not test

- **Real iOS Safari** — wake lock, vibration, audio unlock and PWA install.
  SPEC §15 calls this mandatory and it cannot be done from here. The session
  screen surfaced `screen may sleep (Failed to execute 'request' on
  'WakeLock': …)` throughout, which is expected for a background tab but means
  the wake lock itself is still unverified on a phone.
- **Resume, "End session early", per-set-logging off, and daily-menu mode** —
  all need a session that can be started, and a completed session for today
  blocks that. Worth a deliberate pass tomorrow.
- **The Google OAuth screens**, since the browser was already signed in.
- **Charts with real data** — every session I logged was bodyweight at 0 kg, so
  volume stayed at 0 and no volume chart had anything to draw.
