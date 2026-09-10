# QA pass — 2026-09-10

> **Status: every issue below is fixed.** See `context/15-qa-fixes.md` for
> what was changed and how each fix was verified. The findings are kept in
> full, because the reasoning is why the fixes look the way they do.

A testing pass over the guided session, onboarding, settings, yoga, breathing
and the charts, plus an audit of the server logic against the live database.

## How this was tested, and what that limits

Sign-in could not be performed from here, so this is **not** a true end-to-end
pass. What was exercised instead:

- The `/dev/*` harnesses, which mount the **real** components — the 843-line
  `SessionRunner`, `SettingsForm`, `YogaPlayer`, `BreathingRunner`,
  `OnboardingFlow`, the charts — with stubbed server actions.
- The real server actions and pure logic, read directly and exercised with
  `scripts/qa/adversarial.ts` and `scripts/qa/dates.ts`.
- The production database, queried directly for schema and constraints.

**The harnesses stub the server, so anything the server validates looks broken
in them.** Every finding below was re-checked against the real server code
before being written down. One candidate did not survive that check and is
recorded in "Checked and healthy" so nobody re-reports it.

Not covered: anything that needs a real session — Today, History, Progress and
the session screen with live data; the OAuth flow; push/PWA behaviour; real
touch input (findings were driven programmatically).

---

## High

### H1 — [FIXED] A second tap on "Log set" silently loses a set

**Reproduced.** With an 800 ms server response — which is what this app had
until the region fix earlier today — tap "Log set 1", wait 300 ms, tap again:

| | |
|---|---|
| Counter says | `2 of 7 sets logged` |
| Set list shows | Set 1 filled, Set 2 `—` |
| Next button | **`Log set 3`** |
| Rows actually written | **one** (the upsert overwrote itself) |

`onLogSet` awaits the server *before* updating local state
(`session-runner.tsx:402`), so the button stays mounted and enabled for the
whole round trip. Both taps capture the same `nextSetNumber`, and the state
update appends unconditionally:

```ts
sets: [...e.sets, { setNumber: nextSetNumber, reps, weightKg }]
```

Two entries with the same set number. The list renders by set number so the
duplicate is invisible, but `setsDone` counts 2 and set 2 is skipped forever.

**Why it matters beyond one lost set.** The exercise finishes with 3 rows
against 4 planned, so `evaluateProgression` sees `working.length < plannedSets`
→ `hold` and `consecutiveFailures + 1`. Two sessions like that and the app
**drops the working weight by 10%** — punishing the user for its own dropped
tap. This is most likely to happen exactly when the app is slow, which is when
people tap twice.

### H2 — [FIXED] No async button in the session runner is guarded

`disabled` does not appear anywhere in `session-runner.tsx`. `BigButton` and
`GhostButton` take only `children` and `onClick`; neither has a pending state.
Every action reachable mid-workout can be fired twice during its round trip:
log set, the feel buttons, skip exercise, swap, end session, mark warm-up done.

H1 is the proven case. The **feel buttons are the other dangerous one**: each
calls `finishExercise` → `applyProgression`, which reads the current working
weight and writes an incremented one. Two overlapping calls can apply the
increment twice (60 → 65 kg instead of 62.5 kg).

One fix covers both: a pending state on the shared button components, or a
guard ref in the handlers.

### H3 — [FIXED] `logSet` validates nothing, at any layer

`logSet` (`session/actions.ts:206`) writes `reps` and `weight_kg` straight
through. `session_sets` has **no CHECK constraints**. The client's `onLog` does
no validation either — the inputs' `min`/`max` are decorative without form
validation. Accepted and confirmed written:

| Entered | Result |
|---|---|
| `0` reps | `Set 2  0 reps · 40 kg`, counted in the total |
| `-50` kg | `999 reps · -50 kg` |
| `999` reps | accepted |

This is inconsistent with the rest of the app, which already has the pattern:
`logBodyWeight` rejects outside 25–300 kg, `saveAboutYou` checks age 16–100,
height 100–250 cm and weight 25–300 kg. The one input used dozens of times per
workout is the one with no checks.

Downstream, proved in `scripts/qa/adversarial.ts`:

- `-50` kg → `progressed`, **next working weight −47.5 kg**, best weight −50,
  message "All sets at the top of the range — up to -47.5 kg."
- `999` reps → `exercise_progress.best_e1rm` = **2058 kg**. The SQL view caps
  reps at 12 (84 kg); the stored record does not.
- `weight_kg` is `numeric(6,2)`, so anything above 9999.99 raises a raw
  Postgres overflow error at the user.

### H4 — [FIXED] A workout you did but never "finished" counts for nothing

`session_volume` and the streak calculation both require
`status = 'completed'`. Nothing ever reaps a stale `in_progress` session.

So: do the whole workout, log every set, then close the app or tap Exit rather
than walking through cool-down and summary. Every set is in the database, and
the session contributes **zero** — no streak credit, no volume, no entry in the
charts. It shows in History as "Unfinished".

Same day it is recoverable: Today offers "Resume session". Once the local date
rolls over it is stuck permanently, because Today and `startSession` both
filter on today's `local_date`. A late-night session that runs past midnight
lands in the same state.

---

## Medium

### M1 — [FIXED] Reps prefill at the top of the range, and that drives progression

`SetEntry` initialises `reps` to `repsTarget`, which is `current.repsMax`. In a
4×8–12 exercise the field reads **12** before the user touches it.

Tapping "Log set" four times with no input produced a perfect 4×12 and:

> "All sets at the top of the range — up to 62.5 kg."

Double progression is defined as *reach the top of the range on every set, then
add weight*, so prefilling the top means the default path always earns a
weight increase. A tired user tapping through gets a heavier prescription they
did not earn — and the increases compound weekly.

Prefilling `repsMin`, or leaving it blank, would make progression reflect what
was actually done.

### M2 — [FIXED] A logged set cannot be corrected

Sets render as plain `<li>` elements. There is no edit or delete affordance
anywhere. `deleteSet()` exists in `session/actions.ts:228` and is **never
imported** — dead code.

Combined with H3, a mistyped set (60 kg where 6 kg was meant, a stray 999) is
permanent, and it feeds progression.

### M3 — [FIXED] A stray 0-rep set quietly costs the user weight

`evaluateProgression` filters to `reps > 0`, so a 0-rep set does not count as a
completed set. Four sets logged with one at 0 reps → `hold`, failures 1. The
same again → `backed_off`, **60 kg → 55 kg** (proved in the adversarial run).
Rejecting 0 reps at entry (H3) removes this.

### M4 — [FIXED] Exit and Skip have no confirmation, and Skip cannot be undone

The Exit control sits in the header next to the elapsed clock and leaves
immediately, mid-set, with no prompt. "Skip this exercise" likewise, and there
is no navigation back to a skipped or previous exercise for the rest of the
session.

Data is not lost — sets are already on the server and the session can be
resumed the same day — but both are one-tap, unguarded, during a workout.

---

## Low / latent

### L1 — [FIXED] Week and deload maths mix UTC and local date parsing

`weekInBlock` (`today/page.tsx`) and the `daysIn` calculation in
`startSession` both do:

```ts
new Date(localDateString)          // parses as UTC midnight
new Date(`${startedOn}T00:00:00`)  // parses as LOCAL midnight
```

`lib/dates.ts` opens with a comment warning about exactly this trap and
provides UTC-safe helpers, which these two places do not use.

Currently harmless: Vercel runs functions in UTC, so both parse identically.
`scripts/qa/dates.ts` shows **0 mismatches under `TZ=UTC`** and **15 under
`TZ=America/New_York`**, including the deload week landing on the wrong week.
A landmine rather than a live bug.

### L2 — [FIXED] `exercise_progress.best_weight_kg` is fetched and never used

Selected in `session/[id]/page.tsx:55`, never read.

---

## Checked and healthy

Worth recording so these are not re-tested or re-reported:

- **Progression maths** — double progression, the two-miss back-off, deload
  hold, bodyweight rep progression and the variation-up path all behave as
  `SPEC.md` section 6 describes.
- **`finishExercise` with `skipped: true`** returns before progression runs. A
  banner appearing after a skip in `/dev/session` is the harness stub ignoring
  the flag, not the app.
- **Onboarding validation** — the real `saveAboutYou` rejects age < 16 and
  > 100, height outside 100–250 cm and weight outside 25–300 kg. *An earlier
  candidate finding that an 8-year-old's date of birth was accepted was a false
  positive: `/dev/onboarding` stubs the action.*
- **Breathing runner** — `Stop` resets state so no partial session is saved;
  `savedRef` is cleared in both exit paths so a second session records.
- **Yoga player** — `setPlayingId(null)` intentionally falls back to the next
  unwatched video rather than closing the player.
- **Charts** — empty, single-point and all-identical-values inputs are handled;
  `niceBounds` returns `[min-1, max+1]` when the range is zero, so no divide by
  zero. Good `role="img"` labels and a toggleable value table.
- **Settings** — lowering days-per-week correctly clamps the yoga-days
  selection (3 → 2 when days dropped to 3).
- **Rest timer** — absolute end timestamp so backgrounding does not drift,
  `Math.max(0, …)` prevents a negative countdown, `firedRef` prevents a repeat
  beep, interval cleaned up.
- **Warm-up / cool-down** — mobility is backfilled to at least three items, so
  the cool-down cannot render empty.
- **External links** — `target="_blank"` paired with `rel="noopener noreferrer"`.

---

## What was done

All ten issues are fixed. `context/15-qa-fixes.md` records the implementation
and the verification for each.

The date arithmetic behind L1 is now covered by `npm run test:dates`, which is
part of `npm test` and passes under UTC, negative-offset and date-line
timezones alike.
