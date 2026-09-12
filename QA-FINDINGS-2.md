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
| home bodyweight, no equipment | 55 / 604 | vertical_pull, horizontal_pull, calf, biceps, rear_delt, lateral_delt |
| home bodyweight, + pull-up bar | 58 / 604 | horizontal_pull, calf, biceps, rear_delt, lateral_delt |
| gym, dumbbells + flat bench | 124 / 604 | vertical_pull |
| gym, everything, knee injury | 350 / 604 | lunge |
| gym, everything | 375 / 604 | — |

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
