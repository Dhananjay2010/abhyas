# 15 — Fixes from the QA pass

Every finding in `QA-FINDINGS.md` is closed here. The findings
document keeps the original reasoning; this file records what changed and how
each change was checked.

## The single change that mattered most

`disabled` appeared **nowhere** in `session-runner.tsx`. Every server action in
the workout screen fired on every tap, and the state update that hides or
advances a button only runs *after* the server answers — so on a slow
connection the button stayed live for the whole round trip.

`run()` now refuses re-entry:

```ts
const busyRef = useRef(false);
const [busy, setBusy] = useState(false);
```

The **ref** does the work. Two taps in the same tick both read a stale `busy`
state, but only one can win a synchronous ref check. The state exists so the
buttons can show it, and every action control now takes `disabled={busy}` —
including the raw `<button>`s for the feel options and the swap list, and
`onFinishExercise`, which bypassed `run()` entirely.

**Why it mattered beyond a duplicate request (H1).** `onLogSet` appended to
local state unconditionally, so a second tap added a *second entry with the
same set number*. The counter read two, the list rendered one, the next button
skipped ahead, and the upsert overwrote itself so only one row existed. The
exercise then finished short of its planned set count, which
`evaluateProgression` reads as a missed session — and two of those drop the
working weight ten percent. The feel buttons carried the mirror-image risk:
each applies progression, so two taps could add the increment twice.

**Verified** at `/dev/session` with the harness stub delayed 800 ms — the same
conditions that reproduced it. Tap, wait 300 ms, tap again: the button reports
`disabled: true` during the request, the counter reads `1 of 7`, and the next
button is `Log set 2`. Before the fix: `2 of 7` and `Log set 3`.

## Validation, in three places (H3, M3)

`logSet` wrote whatever it was given, `session_sets` had no constraints, and
the client's `onLog` did none either — the inputs' `min`/`max` are decorative
without form validation. `0` reps, `-50` kg and `999` reps all reached the
database. This was the only numeric input in the app without checks:
`logBodyWeight` already rejected outside 25–300 kg and `saveAboutYou` checked
age, height and weight.

`src/lib/session/validation.ts` holds the rule. It lives in `lib/` rather than
beside the action because `session/actions.ts` is `"use server"`, and such a
module may only export async functions — a plain validator exported from there
fails the build.

The bounds are deliberately generous: 500 kg is above the heaviest lift ever
recorded, 100 reps covers any sane high-rep set. They reject what cannot be a
set, not anyone's training.

Zero reps is rejected rather than stored, which is also what closes **M3**:
`evaluateProgression` counts only sets with `reps > 0`, so a stray zero made a
completed exercise look like a missed one, and two dropped the weight ten
percent.

Three layers, because each protects something different:

| Layer | Purpose |
|---|---|
| `SetEntry` | The button explains itself before a round trip |
| `logSet` | The rule that holds regardless of the client |
| `CHECK` constraints (migration `20260910140000`) | The rule that holds regardless of the app |

**Verified.** In the browser, each bad input disables the button with its own
message and a valid one re-enables it. Against the live database, inside rolled
-back transactions: `reps=0` and `reps=999` violate `session_sets_reps_sane`,
`weight=-50` and `weight=9999` violate `session_sets_weight_sane`, and
`reps=10 weight=60` inserts. No existing row violated the new constraints, so
they were validated immediately rather than added `NOT VALID`.

## The reps default (M1)

The field used to start on `repsMax` — the **top** of the range. Double
progression adds weight precisely when every set reaches the top, so the
untouched default was a full house: four taps recorded a perfect session and
earned a raise nobody had done.

The first fix, defaulting to `repsMin`, was wrong in the other direction and
was reverted before shipping: four sets at the bottom read as a missed session,
and two of those *drop* the weight ten percent. Any prefilled number is the app
guessing and then recording the guess as fact.

So **the first set of an exercise has to be typed.** The field is empty, the
button is disabled, and a quiet grey line reads "Enter the reps you did." —
guidance, not an error, because the user has not done anything wrong yet. Later
sets carry forward the previous set's reps, which is a number the user actually
entered, and saves the typing on the sets that match.

Weight still prefills, and should: the weight is the app's prescription, the
reps are the user's performance.

**Verified** in the browser and in `scripts/qa/adversarial.ts`: a genuine
4×12 still progresses to 62.5 kg; a genuine 4×8 holds, honestly.

## Undo (M2)

`deleteSet()` had existed in `session/actions.ts` since the session work and was
**never imported**. Sets rendered as plain `<li>`s, so a mistyped set was
permanent — and fed progression.

The most recently logged set now carries an "Undo" control. Deliberately only
the most recent one: removing set 2 of 3 would leave a hole that the next
"Log set" would collide with, since the next number is derived from the count.

**Verified**: logging set 2 then undoing it returns the counter to `1 of 7`,
puts `Log set 2` back as the next action, and moves Undo back to set 1.

## Sessions left open (H4)

Both `session_volume` and the streak calculation require `status = 'completed'`,
and nothing ever closed a stale session. A workout that was actually trained but
never walked through the cool-down and summary — the app closed, or Leave
tapped — contributed **nothing**: no streak credit, no volume, no point on any
chart, with every set sitting in the database the whole time. Same day it was
recoverable through "Resume session"; once the local date rolled over, Today and
`startSession` both filter on today's date and it was stranded permanently.

`lib/session/close-stale.ts` closes them on Today's load. The rule is stated
rather than tuned: a stale session with **at least one working set** counts as
completed, because the person trained; one with none is marked skipped, because
they did not. `duration_seconds` is left null — we do not know how long it took,
and inventing a number would be worse than showing none.

Today gained one parallel query for open sessions (no date filter, because the
local date is not known until the profile arrives). With nothing stale it makes
no further call. When something is credited, Today says so rather than changing
the numbers silently.

## Confirmations (M4)

Leave sat in the header beside the elapsed clock, well inside thumb reach, and
left mid-set on one tap. Skip sat among the secondary actions and could not be
undone — there is no navigation back to a skipped exercise.

Both now ask. Leave is owned by `Shell`, so every phase inherits it without
repeating it, and is switched off on the summary where leaving is the expected
next step. Skip names the exercise and says it cannot be returned to.

Neither loses logged sets, which is why both ask rather than block, and why the
Leave copy says so explicitly.

## Dates, and the duplication that hid the bug (L1)

Two places computed which week of a block a date falls in, and both did it by
subtracting a **locally**-parsed date from a **UTC**-parsed one — the exact trap
`lib/dates.ts` opens by warning about. It was invisible because Vercel runs
functions in UTC, where the two parse identically. Under a negative-offset
server timezone the answer shifts by a day, taking the deload week with it.

The duplication is the more interesting half: the same eight lines existed in
`today/page.tsx` and in `startSession`, so the bug had to be written twice and
could have been fixed in only one.

Now there is one implementation:

- `daysBetween(from, to)` in `lib/dates.ts` — both sides read as UTC, so the
  result is a difference of calendar days with no clock in it. It sits beside
  `addDays`, which already worked this way.
- `weekInBlock(startedOn, today)` and `BLOCK_WEEKS` in
  `lib/program/prescription.ts`, used by both callers. Clamped at both ends: a
  block past its four weeks reports week 4 until rollover replaces it, and a
  start date in the future reports week 1 rather than zero.

Two smaller consolidations came with it, because they were the same class of
thing:

- Both callers also derived the weekday by formatting the clock a *second*
  time, separately from the local date. Across a midnight boundary the two
  reads could disagree — Today could show Tuesday's plan against Wednesday's
  date. Both now use `isoWeekday(localToday)`, derived from the date already
  computed. Checked against the old implementation over 2,400 comparisons —
  six user timezones × 400 days × three server timezones — with no mismatch
  before the swap.
- `session/actions.ts` had its own private copy of `localDateString`. Deleted;
  it uses the shared one.

`ageOn` in `lib/onboarding/options.ts` still parses inline, and is **left
alone deliberately**: it parses local and compares with local getters, so it is
internally consistent and not an instance of this bug. Threading a timezone
through it would touch onboarding and the generator to move a one-day edge on a
legal minimum.

**Verified** by `scripts/test-dates.ts`, now part of `npm test`: calendar
arithmetic in both directions, month, year and leap boundaries, three DST
transitions including the 25-hour day, the full 1→4 walk of a block with
clamping at both ends, and the same instant read either side of the date line.
The whole suite passes under `UTC`, `America/New_York`, `Pacific/Midway` and
`Australia/Sydney`.

## The unused field (L2)

`best_weight_kg` was selected in `session/[id]/page.tsx` and never read. Dropped
from the query.

## Verified

- `npm test` — generator, progression, streaks and dates all pass, under four
  different server timezones.
- `npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `next build` — clean.
- The browser checks described above, at mobile width, against the real
  components in `/dev/session`.
- `scripts/qa/adversarial.ts` — progression outcomes before and after.
- The CHECK constraints exercised against the live database.

## Known gaps

- **Not verified against a real signed-in session.** Sign-in cannot be
  performed from this environment, so these were checked through the dev
  harnesses, which stub the server actions. The server-side rules
  (`validateSet` in `logSet`, `closeStaleSessions`) were verified by reading
  and, for the constraints, directly against the database — but the end-to-end
  path has not been walked.
- **H4 has not been observed firing**, because it needs a session left open on
  a previous day. The credit banner on Today is the thing to watch for.

## Change log

| Date | Change |
|---|---|
| 2026-09-10 | Created. All High and Medium findings from the QA pass fixed: single-entry guard on every session action, three-layer set validation plus CHECK constraints, first-set reps must be typed, Undo on the last logged set, stale sessions closed out on Today, confirmations on Leave and Skip. |
| 2026-09-10 | Low findings fixed: block-week and weekday arithmetic consolidated onto UTC-safe shared helpers and covered by a new `npm run test:dates` suite; the duplicated private `localDateString` in `session/actions.ts` removed; the unused `best_weight_kg` select dropped. |
