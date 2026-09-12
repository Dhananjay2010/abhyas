# 16 — The Breathe tab (phase 1)

## What this delivers

Breathing moves from a runner reached through Today into a tab of its own, and
is rebuilt around one idea: you should be able to breathe with your eyes
closed, and never lose a practice to a mis-tap. The product definition and the
decisions behind it are in [`BREATHE-SPEC.md`](../BREATHE-SPEC.md); this file
records how it is built.

It covers:

- a fifth tab
- a home screen
- a setup screen per practice
- a full-screen practice with synthesised tones, a pause sheet, back-as-pause
  and a check-in
- breathing-shaped History
- the move of the breathing preference out of Settings

It fixes the seven bugs recorded in `BREATHE-SPEC.md` §3.1 (B1–B7).

## Files

| File | Role |
|---|---|
| `supabase/migrations/20260912090000_breathe_phase_one.sql` | Pattern phases and content, `breathing_logs`, preference columns, `record_breathing_practice` |
| `src/lib/breathing/engine.ts` | The timeline: `buildCycle`, `positionAt`, `nextPhaseStart`, lengths |
| `src/lib/breathing/clock.ts` | `PausableClock` |
| `src/lib/breathing/audio.ts` | The shared AudioContext; `scheduleGlide`, `scheduleBell`, `scheduleSwell`, `scheduleHum`, `startAmbience`; dev-only cue log |
| `src/lib/breathing/speech.ts` | The phone's own voice: warm-up, what to say in English and Hindi, what the device offers, dev-only speech log |
| `src/app/breathe/sound-controls.tsx` | The sound settings, shared by the setup screen and the preferences sheet |
| `src/lib/breathing/pattern.ts` | Types, row mapping, `parsePhases`, preferences, session URL options, moods |
| `src/lib/breathing/stats.ts` | Week strip, minutes this week, streak |
| `src/lib/breathing/validation.ts` | Practice and preference rules, shared by client and server |
| `src/lib/breathing/client.ts` | `uuid()` without a secure context, iOS detection, the "opened from inside the app" flag |
| `src/lib/breathing/theme.ts` | Session colours and ring geometry, importable by server components |
| `src/app/breathe/page.tsx`, `breathe-home.tsx` | The tab |
| `src/app/breathe/prefs-sheet.tsx`, `controls.tsx`, `rhythm-preview.tsx`, `use-media.ts` | Shared pieces |
| `src/app/breathe/load.ts` | Resolves a slug to a practice -- ours, retimed, or yours -- for both screens |
| `src/app/breathe/timing-editor.tsx` | A stepper per phase, in half-seconds |
| `src/app/breathe/new/*` | Making, editing and deleting a practice of your own |
| `src/lib/breathing/suggest.ts` | The "for right now" rule, as a pure function |
| `src/app/breathe/actions.ts` | `recordBreathingPractice`, `rateBreathingPractice`, `updateBreathingPrefs` |
| `src/app/breathe/[slug]/page.tsx`, `practice-setup.tsx` | Setup |
| `src/app/breathe/[slug]/session/page.tsx`, `breathing-session.tsx` | The practice |
| `src/app/breathe/**/loading.tsx` | Skeletons; the practice's is already the dark room |
| `src/components/bottom-nav.tsx` | Five tabs; the practice route is off the allowlist |
| `src/components/session-row.tsx`, `src/app/history/page.tsx`, `src/app/history/[id]/{page,breathing-detail,stat}.tsx` | History |
| `src/app/settings/settings-form.tsx`, `page.tsx` | The breathing control replaced by a pointer |
| `src/app/dev/breathe/**`, `src/app/dev/breathe-sound/*`, `src/app/dev/history/breathing/page.tsx` | Harnesses |
| `scripts/test-breathing.ts` | 18 groups; part of `npm test` |

Removed: `src/app/breathe/breathing-runner.tsx` and `src/app/dev/breathe/preview.tsx`.

## How it is implemented

### Patterns are phase lists

A pattern used to be four numbers plus special cases keyed on the slug. It is
now `breathing_patterns.phases`, a JSON array. Each entry:

```jsonc
{ "kind": "inhale" | "hold" | "exhale", "seconds": 4, "cue": "In through the left",
  "label": "Sniff",   // optional: the rhythm-chip name, else In / Hold / Out
  "side": "left",     // optional: the open nostril
  "to": 0.8 }         // optional: orb size the phase ends at; inhale → 1, exhale → 0
```

The data carries each pattern's peculiarities, so the player has no slug
special cases:

- Nadi Shodhana's six phases put both sides in one cycle.
- The sigh inhales to 0.8, then sniffs from 0.8 to 1.
- Bhramari's exhale says "Hum".

`parsePhases` refuses anything malformed. A row whose phases fail simply
doesn't appear, rather than reaching the player. The test suite parses every
phase list in the migration.

### The timeline is a pure function of time

`buildCycle` resolves each phase's start offset and its orb sizes. It walks the
cycle twice, because a hold inherits the size of the phase before it and the
first phase's "before" is the last one. It also counts breaths per cycle: an
inhale that follows another inhale is the same breath, so the sigh has one and
Nadi Shodhana has two.

`positionAt(cycle, cycles, t)` returns the cycle, the phase, its progress, the
remaining seconds and the eased orb size (sine in-out) for any `t`. There is
no state to go wrong.

Two earlier bugs came from interval state machines, context/12's frozen timer
and its double-counted cycles. Neither can happen here.

`nextPhaseStart` gives the next boundary, and that's what the audio lookahead
schedules. A small epsilon keeps 5.5-second phases exact over a hundred cycles.

### Length rules (`lengthPlan`, `initialCycles`)

- **In minutes.** The options are 1, 3, 5 and 10 minutes, each turned into
  whole cycles. A practice never stops mid-breath.
- **Custom** runs from 1 minute up to an hour, or the pattern's cap if that is
  lower.
- **Capped patterns.** A pattern whose cap is under three minutes is chosen in
  breaths. 4-7-8 (cap 8) offers 2, 4, 6 or 8.
- **Options past the cap are dropped** rather than clamped, so a label never
  lies about the length.
- **The starting length** is your last one for that practice. Failing that, a
  breaths-mode pattern starts at its default count, and anything else at your
  usual minutes. It is always inside the cap.

### Session options travel in the URL

`sessionSearch` and `parseSessionSearch` produce and read the practice URL:

```
?cycles=19&sound=tones&count=1&vib=1&settle=1&checkin=after
```

What the setup screen chose is therefore exactly what runs, even if the save of
a just-changed preference has not landed. The parser falls back to stored
preferences for anything missing. It clamps the number of cycles to the
pattern's cap and to one hour, so a hand-edited URL can't start a practice the
setup screen would refuse.

### The practice screen

`BreathingSession` owns what outlives one practice:

- **The history guard.** On mount it pushes one extra history entry with the
  same URL, marked `breatheGuard`. It skips the push if the current entry is
  already a guard, which covers strict mode running effects twice. Back pops
  only that entry, so nothing navigates. The `popstate` handler opens the pause
  sheet and pushes the guard again. Once the practice has finished, back simply
  leaves.
- **How to leave.** `openedFromApp()` records whether a Start or Again tap in
  this page load opened the practice. If one did, leaving is `history.go(-2)`,
  back past the guard to the page you came from. If not (a reload or a pasted
  link), there is nothing of ours behind it, so it is `router.replace` to the
  tab.
- **The week's running total.** It adds to the strip as each practice is saved.
- **"Again".** It remounts the inner `Practice` with a new key.

`Practice` runs one practice through its stages:

- **Stages.** `checkin` → `running` → `finished`. Within `running` there are
  three sub-stages, derived each frame: `settle` (t < 0), `practice` and
  `winddown`.
- **One frame loop.** A single `requestAnimationFrame` loop reads
  `PausableClock.elapsed()`, asks the engine for the position, and writes the
  orb, glow, halo, ring and progress bar straight to the DOM through refs. React
  re-renders only when a phase, a second or a count changes.
- **Pausing** stops the loop, the clock and every sounding voice.
- **Reduced motion.** With it on, the orb keeps a fixed size and its opacity
  follows the breath.
- **Saving at the last breath.** When the last breath ends, the practice is
  saved immediately, before the wind-down, so closing the app then loses
  nothing. `logId` is a client-generated UUID, so **Try again** repeats the
  same call and the database recognises it.
- **The after-check-in.** A mood chosen before the save lands is held and sent
  once it does.
- **The practice pauses when:**
  - the Pause or End button is pressed
  - Escape or Space is pressed, while focus is not on a button
  - Back is pressed
  - the page is hidden (`visibilitychange`)
- **End and save** needs at least one completed round, and saves with
  `ended_early`.
- **Wake lock** is held while the practice is live, using the existing
  `useWakeLock`.
- **Layout.** The screen is a column: header, `main` (flex-1) and footer. The
  orb box is `min(300px, 36dvh)`, so the words can never slide under the
  controls on a short screen.

### Sound

- **Unlocking.** `unlockBreathAudio()` runs inside the Start, Again or Begin
  tap. It creates one shared AudioContext and master gain, resumes the context,
  and sets `navigator.audioSession.type = "playback"` where Safari offers it,
  so the silent switch doesn't mute it on iOS 17 and later. The context is
  module state, so it survives the client-side navigation from setup to the
  practice.
- **Scheduling.** Each frame, a lookahead of 250ms schedules the next boundary
  on `ctx.currentTime`:
  - **inhale or exhale:** a glide for the whole phase, its pitch following the
    orb (G3→D4)
  - **hold:** a bell, high after an inhale and low after an exhale
  - **settle-in:** three ticks
  - **the last breath:** a low bell as it ends
- **Resuming.** On resume, or when sound is first allowed, the phase already
  under way gets a glide for its remaining time.
- **Pause and mute** stop every voice, fading out to avoid clicks.
- **The glide** is three partials (sine, an octave-up sine and a sub-octave
  triangle) through a low-pass filter, with a sine-shaped attack and release.
- **If the context isn't running,** the screen shows "The browser paused the
  sound. Tap to turn it back on."
- **A cold load.** A practice opened without a prior tap, such as a reload,
  asks for **Begin** first.
- **Development only.** Every cue is appended to `globalThis.__breathCues` and
  the context is exposed as `__breathCtx`. `process.env.NODE_ENV` is replaced at
  build time, so none of this ships.

### Saving: `record_breathing_practice`

This is a `SECURITY INVOKER` plpgsql function, so RLS applies to everything
inside it. Its steps:

1. If a log with `p_log_id` exists, return its session. This is what makes a
   retry idempotent.
2. Read the pattern's name. An unknown pattern raises an error.
3. Look for a **planned breathing slot**: a session for today with
   `planned_type = 'meditation'` that isn't completed. Lock it and complete it
   if there is one; otherwise insert a new completed session. This is the fix
   for B1: an unfinished workout is never touched.
4. Insert the `breathing_logs` row. The `set_user_id_from_parent` trigger sets
   its owner from the session.

`anon` is refused `EXECUTE`. `recordBreathingPractice` validates with the same
rules the browser uses before calling it. The generated types mark every
function argument as non-null, so `p_mood_before` is passed with a type
assertion and documented at the call.

### Preferences

Five columns on `user_settings` sit alongside the existing
`meditation_default_minutes`, which remains the usual length:

- `breathing_guidance`
- `breathing_show_count`
- `breathing_vibrate`
- `breathing_settle_in`
- `breathing_check_in`

`updateBreathingPrefs` validates and writes them, then revalidates `/breathe`
as a layout. The sheet and the setup screen save as they are touched.

### Stats

`breathingStats` counts **calendar days**, not scheduled training days, because
breathing isn't part of the plan. An empty today doesn't break the streak. It
reads completed `meditation` sessions, not logs, so practices from before logs
existed still count.

### History and Settings

- **Session rows.** `sessionLabel` names a breathing session after its pattern.
  `SessionRow` shows "Breathing · m:ss · N breaths", because "0 min" would hide
  short practices.
- **The detail page.** `/history/[id]` returns `BreathingDetail` for a
  `meditation` session: time, breaths, sound, check-in, ended-early, and
  Practise again.
- **The embed.** Both queries name the pattern through
  `breathing_patterns!sessions_breathing_pattern_id_fkey`. It isn't required
  today (checked against the live API), but it guards against `breathing_logs`
  ever becoming a many-to-many join.
- **Settings.** "Breathing session length" is replaced by a sentence linking to
  the tab.

### The harnesses

| URL | Shows |
|---|---|
| `/dev/breathe` | The tab; `?fresh=1` for someone with no history, `?intent=sleep` for a filter |
| `/dev/breathe/<slug>` | Setup; `?fresh=1` shows the safety note, `?last=11` a returning user |
| `/dev/breathe/<slug>/session` | The practice, with the real URL options plus `?speed=8` (divides every phase) and `?fail=1` (first save fails) |
| `/dev/breathe-sound` | Renders the real tones offline, measures them, and has a Play button |
| `/dev/history`, `/dev/history/breathing?v=full\|early\|legacy` | Breathing rows and detail |

The stubs log every payload to the console as `[breathe harness] …`, and wait a
little, so "Saving…" states and double taps are visible.

## Decisions and why

- **The practice has its own route.** The nav is an allowlist, so the practice
  loses the tab bar without an opt-out, and each screen gets a URL the back
  button can use.
- **A pure timeline.** The earlier bugs lived in the state machine; a function
  of time has no state to corrupt.
- **One database function for saving.** It makes the write atomic, fixes B1,
  and makes retries safe, in one place that RLS still governs.
- **Preferences on `user_settings`, not a new table.** There is exactly one row
  per user already; see `BREATHE-SPEC.md` §11.2.
- **Options in the URL.** It is deterministic, testable and survives a reload.
- **Tones synthesised.** No assets and no licences, it is precise to the audio
  clock, and it can be measured offline.
- **A single-column list, not the proposed grid.** Long names wrap badly at half
  width.
- **The streak in calendar days.** Breathing isn't scheduled.

## Verification performed

See `BREATHE-SPEC.md` §12 for the full list.

- **Unit tests.** `npm test`, including 18 breathing groups, passes.
- **Live database.** The migration was applied and its schema checked. The
  function was run as the real user under RLS inside a block that always rolls
  back, with 15 of 15 expected results, including B1 and an idempotent retry.
  Nothing was left behind.
- **Live API.** `anon` is refused the function. The embeds and the inner-join
  filter parse.
- **Browser.** Every screen and path was exercised in the harness:
  - the tab at 375px
  - the filter written to the URL
  - saving a preference
  - 4-7-8 capped in breaths
  - Nadi's sides
  - the tab bar hidden in the practice
  - cue timing within about 2ms of the timeline
  - back → pause
  - End and save's payload
  - the check-in under the same log id
  - Done → where you came from
  - a cold load → Begin
  - a failed save → Try again with the same log id and a held mood
  - before and after check-in
  - reduced motion
  - no overlap at 454px or 812px tall
  - History rows and details
  - the Settings pointer
- **Sound lab.** 11 of 11 measurements passed in Chromium's Web Audio.
- **Static checks.** Typecheck, lint and `next build` are clean.

## Phase 2a — sound (2026-09-12, branch `breathe/sound`)

Migration `20260913090000_breathe_sound.sql`, additive: guidance widens to
`tones | ocean | voice | off` in both `user_settings` and `breathing_logs`;
`breathing_ambience`, `breathing_ambience_volume` and `breathing_voice_lang`
join the preferences; and Bhramari's exhale gains `"hum": true`.

### Ocean

`scheduleSwell` is pink noise through a high-pass and a low-pass, where the
gain **and** the cutoff both follow the same eased size curve the orb does,
written as a `setValueCurveAtTime` across the phase. A hold is a phase whose
size does not change, so the sea holds its level -- which is the signal to
hold, with no bell needed. Ocean therefore schedules something for every
phase, holds included, where tones schedule a glide and a bell.

### The beds

`startAmbience` returns a handle with `setVolume` and `stop`, fades in over two
seconds and out over one and a half, and is stopped with everything else on a
pause.

- **rain** two noise layers, a bright patter and a low hiss
- **waves** noise under a low-pass whose gain is swung by a 0.07 Hz oscillator,
  about fourteen seconds a wave, deliberately not synced to your breath
- **hush** noise pushed through two low-passes to a brown-ish slope
- **tanpura** four saw strings (Pa, Sa, Sa detuned, Sa an octave down) through a
  low-pass, each shimmering at its own slow rate. An approximation, not a
  recording

All of them share one six-second noise buffer per context, cached in a
`WeakMap`, each source starting at a random offset so two layers never phase
together.

### The hum

A phase may carry `hum: true`. Bhramari's exhale does, and the player then
plays a quiet saw with a 5.5 Hz vibrato through a low-pass -- a pitch to match
rather than a glide that would fight the humming. It plays in every mode, since
it is the practice's own instruction.

### Voice

`speech.ts` wraps the Web Speech API and is honest about it:

- **iOS speaks only from inside a tap**, so `warmUpSpeech` speaks one silent
  utterance from the Start, Again, Begin, Resume and sound-toggle taps. iOS can
  also stop speaking after the app has been backgrounded, which is why Resume
  warms it again.
- **Safari often returns an empty voice list**, so a voice cannot always be
  chosen. An empty list is reported as "the system picks", not as a missing
  language.
- Other browsers fill the list late, so `voiceschanged` feeds a
  `useSyncExternalStore`.
- What is spoken is the short form ("In through the left", "Sniff", "Hum"), not
  the screen's sentence, because a four-second breath has no room for one.
  Hindi has its own wording rather than a translation of the English.
- A cue is spoken as the phase turns. Speech cannot be scheduled on the audio
  clock, so it lands within a frame of where the other modes place their sound.
- If the browser cannot speak at all, the practice plays tones and says so.

### Where the settings live

`SoundControls` is shared by the setup screen and the preferences sheet, so the
two cannot drift. Everything a practice sounds like travels in the session URL
(`sound`, `amb`, `vol`, `lang`), and `parseSessionSearch` clamps it.

### Verified

19 test groups pass, including the new URL fields and what the voice says in
both languages. The sound lab (`/dev/breathe-sound`) renders every sound
offline and measures it: 18 of 18. A live Ocean practice scheduled the rain bed
and swells at the phase boundaries with no glides; a live Voice practice spoke
the warm-up on the tap and then each cue exactly on the boundary (5.0s, 9.0s,
13.0s), all started, none errored. `BREATHE-SPEC.md` §14 has the numbers.

Three things were wrong and were fixed: a pitch measurement that locked onto
the tone's sub-octave and reported half the pitch, a hydration failure from
reading the device's voices during render, and the "Again" card building a
practice without the new fields.

## Phase 2b — your own practice (2026-09-12, branch `breathe/sound`)

Migration `20260914090000_breathe_your_own.sql`: four more practices, the
`user_breathing_patterns` table, `breathing_logs.user_pattern_id`, and
`record_breathing_practice()` replaced (the old signature dropped) to take
either kind of practice.

### One table for two things

`user_breathing_patterns` is a list of phases that belongs to you.

- `base_pattern_id` set -- your timings for one of ours
- `base_pattern_id` null -- a practice you made

A partial unique index on `(user_id, base_pattern_id) where base_pattern_id is
not null` means one set of timings per practice, so saving twice replaces
rather than accumulates. The same owner rules as every other user table.

`withUserPatterns(builtins, mine)` folds them together: your timings replace
ours **on the practice itself**, which keeps its own id so history still groups
it, and gains `adjusted: true` and the id of the row holding them. Your own
practices join the end with `kind: "mine"` and a slug of `mine-<id>`, which is
why they need no slug column and route through the same `[slug]` pages.

### Resolving a slug

`load.ts` does it once for both the setup screen and the practice, so they can
never disagree. It also answers "how long did I do this one last time" from the
last fifty logs, keyed by the built-in for ours and by your row for yours.

### Recording one

The function now takes `p_pattern_id` and `p_user_pattern_id`:

- a practice of your own -- your row only
- one of ours you have retimed -- both, so History still groups it
- a practice id that is not yours -- refused, rather than logged nameless

Deleting a practice of your own clears the foreign key rather than cascading,
and the log keeps the name it was practised under, so your history survives.

### The editor

`TimingEditor` steps the seconds of the phases a practice already has, in
half-seconds, never their order or their words. That is what lets one control
serve Nadi Shodhana's six phases, the sigh's two-part inhale and a four-count
square. `toEditorSlots` lays a saved practice back out in the four editable
slots by **kind, in order** -- see the bug below.

### Suggesting one

`suggestPractice` is a pure function of the hour where the user is, whether
they trained today, and what the Again card already offers. `calmShifts` groups
your rated practices and needs two before it says anything.

### Verified

22 test groups pass. The save function was exercised as the real user under
RLS, rolled back, covering a practice of your own, a retimed built-in, an
idempotent retry, an id that is not yours, the unique index, and B1. Every
screen and both save flows were clicked through in the harness.
`BREATHE-SPEC.md` §15 has the numbers.

**The bug this found:** the edit form filled the four editable slots by
position, so a saved "in 4, out 8" showed its exhale in the hold's slot with a
phantom second "Out" below it. Slots are matched by kind now, with tests.

## Phase 3a — routines (2026-09-12, branch `breathe/routines`)

A routine is two to four practices run back to back inside one session.
`BREATHE-SPEC.md` §16.1 is the design; §17 is what was built and verified.

### The shape of a routine

`breathing_routines` holds the catalogue, read-only from the client under the
same single `select` policy as `breathing_patterns`. Four are seeded:
Downshift (after training), Wind Down (for sleep), Morning, and Reset.

`steps jsonb` names each practice by slug and gives its length in one of the
two units the setup screen offers:

```json
[{"slug": "physiological-sigh", "cycles": 5},
 {"slug": "extended-exhale",    "minutes": 2}]
```

**The length is stored as the intent, not as a cycle count.** `resolveRoutine`
(`src/lib/breathing/routine.ts`) turns it into real cycles against whatever
phases that practice has *for this person*, so a Coherent Breathing you have
retimed to six seconds a side still runs for about the two minutes the routine
promises — eleven cycles become ten. A routine whose steps cannot all be found
resolves to null and is not offered at all, because "Downshift" without its
first step is not Downshift.

### Running one

`BreathingSession` already separated what outlives a practice from one practice
(`Practice`, remounted by key for "Again"). A routine reuses that exactly: the
key becomes `attempt:step`, and finishing a step increments the step.

Between steps, `Handoff` names what is next and counts down six seconds before
starting it on its own — a routine you have to tap through four times is not a
routine. "Start now" skips the wait; "End here" stops and goes to the ending,
where what you have already done is saved. Two details make the seam work:
settling in happens only on step one (`stepIndex === 0`), and the wind-down
between steps is three seconds rather than ten, because the hand-off is itself
the pause.

### One session, a log per step

`record_breathing_practice` gained `p_session_id`, `p_routine_id` and
`p_routine_step`. The first step passes no session and gets one back exactly as
a single practice does; later steps pass that session, and their seconds are
added to its duration. The early return on an existing log id is what stops a
retry counting those seconds twice.

The threading lives in `BreathingSession`, not in `Practice`: a promise chain
serialises the saves so the second step cannot open its own session while the
first is still opening one, and the outer component passes `Practice` a wrapped
`recordBreathingPractice` that fills in the session. If a step's save fails the
session id stays null and the next step opens its own — a degraded result
rather than a lost practice — and the ending says so: "An earlier step of this
routine could not be saved."

**Both check-ins go on the first step's log.** `calmShifts` pairs "before" and
"after" on one row, so splitting them across steps would silently drop every
routine out of "what works for you". The outer component therefore rewrites the
rating's log id to the first step's.

### What it changes elsewhere

- **Breathe home** lists routines above the practices, filtered by the same
  intent chips.
- **"Again" and remembered lengths skip routine logs.** A routine's step
  lengths were the routine's choice, not yours, so they must not become the
  length a practice offers on its own.
- **"What works for you"** groups a routine under its own name
  (`routine_name ?? pattern_name`).
- **History** names a session for its routine rather than for the first step's
  practice, and the detail page lists the steps with their own times and
  breaths. Its "Sound" stat now reads from `GUIDANCE_OPTIONS`, so Ocean and
  Voice appear — before this it only knew Tones and Off, a gap left from phase
  2a.

### Verified

25 test groups pass. The database function was exercised as the real user under
RLS and rolled back — 18 checks, including a second user created inside the
transaction so "someone else's session" was a real row rather than a case the
test had to skip. The whole sequence was watched end to end in the harness.
`BREATHE-SPEC.md` §17.3 has the detail.

**Two things this found.** A step written as "5 breaths" displayed as "45 sec",
because the label re-derived its unit from the practice's own cap instead of
honouring the unit the step was written in. And ending part-way through the
last step still claimed "All 2 steps"; it now says "2 of 2".

## Phase 3c — Kapalabhati (2026-09-12, branch `breathe/kapalabhati`)

Decision Q4, designed in `BREATHE-SPEC.md` section 16.3 and recorded as built
in section 18.

### Two new phase kinds, and why they had to exist

The three original kinds cannot express Kapalabhati. Twenty pumps would be
forty phases, past the twenty-four a pattern may have — and the app does not
pace each pump anyway. It sets a tempo and you follow it. So:

- **`pump`** — *n* breaths a second for *s* seconds, as one phase. It carries a
  `rate`, and `buildCycle` precomputes `pumps` from it.
- **`rest`** — breathing normally for *s* seconds. Deliberately not a hold:
  nothing is held, and the orb must not animate as though it were pacing you.

A pump is the only phase that does not travel from `from` to `to`. `sizeIn`
gives it an oscillation between `PUMP_LOW` (0.22) and `PUMP_HIGH` (0.5),
starting high and snapping down, because the first movement of a pump is the
forceful exhale. `pumpAt(phase, elapsed)` says which pump is happening, and
that is what the screen counts.

Both kinds are additive: every existing pattern parses and runs unchanged, and
`parsePhases` only accepts a `rate` on a phase that actually pumps, between 0.5
and 4 a second.

### What had to be told this practice is different

1. **Length is chosen in rounds** (`lengthPlan` → `unit: "rounds"`), with no
   custom option. Neither minutes nor breaths is how anyone chooses to do it.
2. **The rhythm preview samples the engine twice a pump**, so the small orb on
   the card pumps instead of drifting — 42 keyframes over a 60-second round.
3. **`resolveRoutine` refuses a routine containing it.** A routine runs straight
   through without asking, which is exactly what the confirmation exists to
   prevent. No seeded routine names it; this is a guard, not a fix.
4. **The timing editor is not offered** for a practice that pumps, and
   `validatePatternDraft` still accepts only inhale, hold and exhale — so a
   practice you build yourself cannot contain a pump or a rest.
5. **Two screens count pumps, not breaths.** They are breaths, but "60 breaths"
   beside "3 rounds" only raises the question.

### Sound

`schedulePumps` in `audio.ts`: a dry 147 Hz knock per pump, the whole round
scheduled in one call on the audio clock so the tempo cannot drift. It plays in
**every** mode, voice included — the knocks are the tempo, not decoration, and
no voice can count at one a second. A rest is silent on purpose. Vibration
fires once at the turn of a phase rather than per pump, which would be a second
tempo running against the one you are following.

### The confirmation

`user_settings.breathing_kapalabhati_ack`, a boolean column rather than a table:
there is one practice that needs this, and a table would be pretending
otherwise. The comment in the migration says what to do if a second ever
arrives.

`PracticeSetup` renders `SafetyGate` instead of itself when
`needsConfirming(pattern.phases)` and the acknowledgement is unset. The gate has
no Start button at all — accepting it saves the preference and reveals the
setup.

### Seeded gentler than designed

Section 16.3 sketched `pump 30 s at 1.5/s, rest 30 s`. What shipped is **20
pumps at one a second, then 40 seconds of rest**, three rounds. This is the one
practice here that can genuinely make someone faint; the conservative version is
a tempo a beginner can hold, with a rest long enough to notice how they feel
before the next round. The spec records the change and the reason.

### Verified

28 test groups pass. **The gate was accepted on the real signed-in account and
`breathing_kapalabhati_ack` confirmed `true` in the live database** — the first
phase-3 screen exercised signed in. A round was watched end to end in the
harness: the counter stepping 1/20 to 20/20, the rest counting down, round two
counting again, and the log recording 40 breaths for two rounds. The orb's own
transform was sampled while it ran and swings exactly between `PUMP_LOW` and
`PUMP_HIGH`. `BREATHE-SPEC.md` section 18.3 has the detail.

**What this found:** two screens describing pumps as "breaths".

## Phase 3b — a signature shape per practice (2026-09-12, branch `breathe/shapes`)

`BREATHE-SPEC.md` section 16.2 is the design; section 19 is what was built.

### The problem

Every practice drew the same circle, so the screen told you nothing about which
one you were doing. Six shapes now: a square whose ring traces one side per
phase, a teardrop for the two weighted to the exhale, two lobes with the open
nostril lit, ripples spreading while you hum, a flash on every pump, and the
circle for the smooth even ones.

### One component, one method

`src/app/breathe/breath-shape.tsx` owns all of it and exposes exactly one
thing: `paint(frame)`. The frame carries what the engine already returns -- the
eased size, the progress through the phase, the cycle progress, the phase kind
and the open side -- and the component writes straight to the DOM. Nothing goes
through React, which is what the practice screen already required of the orb it
replaced.

Two decisions carry most of the weight:

- **`pathLength={1}`** on the ring. SVG normalises whatever outline the shape
  has to a length of one, so the painter writes a fraction and never measures a
  path or computes a circumference. A square ring and a circle ring share the
  same line.
- **The square traces the cycle, not the phase.** `cycleProgress` is
  `(phaseIndex + progress) / phaseCount`, which sweeps once per cycle and
  resets. It still works if a hold is switched off and only three phases
  remain -- the box simply becomes thirds.

The pump flash is read off the size rather than plumbed through as a second
number: during a pump the size already oscillates between the engine's two
pumping bounds, so normalising it gives the flash for free. Those two bounds
are duplicated in the shape module on purpose, with a comment saying why: how
bright a flash is a drawing decision, not a breathing one.

### Shape is content

A `shape` column on `breathing_patterns`, checked against the six names and
defaulting to `'orb'`. A pattern seeded later declares its own without the
player changing, and `asShape` coerces anything unknown, missing or of the
wrong type back to the circle. A practice of your own is always a circle: it is
whatever you made it, and a silhouette would claim something untrue about it.

### The cards

None of the real drawing reads at fifty pixels, so `RhythmPreview` carries the
silhouette instead -- a border radius per shape, a pair of lobes, one still ring
for the hum -- over the rhythm it was already animating. A teardrop is a square
with three rounded corners turned onto its point, so its rotation has to ride
along inside every scale keyframe rather than sitting on a wrapper.

### Verified

29 test groups, including one that reads the shape assignments **straight out
of the migration file**, so the documented table cannot drift from the database.
Every shape was then driven in the browser and measured rather than eyeballed:
the square's ring sweeping `0.025 → 0.825` across four phases and resetting; the
lobes sampled as a time series through a full Nadi Shodhana cycle; the hum's
three rings at staggered radii with fading opacities and dark on the inhale;
exactly 20 flashes in a 20-pump round; and all eleven card silhouettes. Reduced
motion was forced by overriding the media query: the shape held `scale(0.84)`
across fifty samples while opacity carried the breath.

**Worth remembering for next time:** a first pass at the lobes recorded only the
last sampled value per cue and looked inverted. It was not a bug -- it was the
one-sample window where the frame callback has advanced to the next phase and
React has not re-rendered the words yet. A time series showed it immediately.
Sampling a rAF-painted DOM against React-rendered text needs a series, not a
map.

## Phase 3d — Breath foundations, a seven-day course (2026-09-12, branch `breathe/journey`)

`BREATHE-SPEC.md` §16.4 asked for a short course, one practice a day with a
sentence on what it teaches, day one the physiological sigh and day seven
whichever practice the person's own check-ins rate best. §20 records it as
built.

### What makes it a course rather than a list

Two rules, and they are the whole design: **days go in order, and one counts
per calendar day.** Without the second rule a seven-day course is an
afternoon's work and teaches nothing about coming back. Missing days never
resets anything, because the point is to return.

A third decision follows from them: **a day counts when you reach the end of
it.** Ending part-way still saves the practice — it is a practice you did — but
the day stays open, and the ending screen says so rather than letting someone
discover it tomorrow. The alternative, counting any practice however short,
would make "End and save" after five seconds a day of the course.

### Where the rules live

`supabase/migrations/20260918090000_breathe_journey.sql` adds
`breathing_journeys`, `user_journey_progress` and
`advance_journey_day(journey, day, local_date, log_id)`.

`user_journey_progress` has a **select policy and no write policy at all**.
Every write goes through the function, which is the only place the two rules
exist. This is the one function in the breathing section that is `security
definer` rather than `security invoker`: with no client write path, the rules
*are* the write path, and leaving them to the caller would make them
decoration. Everything it touches is scoped to `auth.uid()`, and it is granted
only to `authenticated`.

Two details worth keeping:

- **A day counts only against a `breathing_logs` row that exists and is
  yours.** The caller passes the log it has just written. This is checked
  before the progress row is created, so a refused attempt leaves no trace.
- **Refusing is not an error.** Repeating a day is an ordinary thing to do —
  "Again" on the ending screen does exactly that — so the function returns
  `(days_completed, day_count, advanced)` rather than raising, and the screen
  says which case it was. A function that threw here would put a red error in
  front of someone who had just finished a practice.

### The last day

Day seven is `{"pick": "best", "slug": <fallback>, …}`. `bestRated` in
`src/lib/breathing/journey.ts` resolves it against the same `calmShifts` that
feed "What works for you": highest average afterwards, ties to the practice
done more often.

Two exclusions matter. A **gated practice is never chosen**, however well it
rates — a course must not walk anyone past Kapalabhati's confirmation, which is
the same rule `resolveRoutine` applies to steps. And a **routine's name matches
no practice**, so routines drop out on their own, because check-ins group a
routine under its own name.

With too few check-ins the day falls back to the slug the course names and says
plainly that it is a fallback. That matters more than it sounds: without a
fallback, a brand new course would fail to resolve for everyone who has never
answered a check-in, which is everybody on day one.

### Where the day is counted

`BreathingSession` wraps the save action for a journey exactly as it wraps it
for a routine (`saveDay` beside `saveStep`). The practice saves first; only a
successful, not-ended-early save counts the day. Two things fall out of this
for free: the retry on a failed save counts the day too, and nothing new had to
be threaded through `Practice`, which already had six props too many.

### Routes

`/breathe/journey/<slug>` and `/breathe/journey/<slug>/session`, mirroring the
routines, with `loadJourney` in `src/app/breathe/load.ts` shared by both so
they cannot disagree about which day is open.

**Which day may run is decided on the server, not read from the URL.** A day
that is done can be run again — a reload straight after finishing one lands
there, and repeating is allowed anyway — but a day still ahead redirects back
to the course.

### Verified

32 test groups. Group 32 reads **the seeded course out of the migration file**
and checks every day's slug against the slugs in the pattern migrations, so the
course cannot name a practice that does not exist.

The two rules were tested as the real user against the live database inside a
rolled-back transaction: twelve checks covering ordering, one-a-day, jumping
ahead, an invented log id, a **stranger's** log id, direct writes and inserts
(both refused by RLS), `completed_at` on the seventh day, and the absence of an
eighth.

In the browser, every screen state was driven and read — not started, three
days in, already counted today, finished, and day seven both chosen and falling
back — and a day was run end to end four times: finished, repeated, ended
part-way, and with the save failing then retried.

**Two latent phase-3a bugs surfaced while wiring this up.** Both were fixed
here rather than noted:

- The tab bar was missing from the routine setup page. `BREATHE_PAGE` in
  `src/components/bottom-nav.tsx` matched one path segment after `/breathe`,
  and routines live two deep. The regex now names `routine` and `journey`
  explicitly and was checked across ten routes.
- A routine's practice screen loaded the Breathe tab's bright skeleton instead
  of the dark room, because `loading.tsx` existed only under `[slug]/session`.
  Both nested session routes now re-export it.

**And one in the dev harness:** `fixture.ts` was missing four practices
(Extended Exhale, Ujjayi, Anulom Vilom, Sheetali), which `resolveRoutine`
silently turned into two of the four routines never appearing in the harness at
all. The fixture's own comment says "keep the two in step by hand", and it had
drifted. The four were regenerated from the live rows.

## Known gaps

- **Signed in: partly closed.** On 2026-09-12 Dhananjay practised on localhost
  while signed in and the app recorded it correctly (Physiological Sigh, 7
  breaths, 63 seconds, tones, check-in saved). That covers phase 1 and 2a. The
  phase 2b screens and the other sound modes have still only been exercised in
  the harness and in SQL. The phone checklist is in `BREATHE-SPEC.md` §13.
- **Real-device behaviour is unproven:** iOS silent switch and audio unlock,
  vibration, the wake lock across a long practice, and locking the phone
  mid-practice.
- **Keyboard activation of the focused Resume button is unverified.** The
  automation's synthetic Enter and Space didn't activate it. A click does.
- Sheets move focus in but don't trap it.
- The streak window is 370 days.
- Practices recorded before `breathing_logs` existed show as "Breathing" with no
  details.
- **Nothing about the voice is proven off this Mac.** iOS speaks only from a
  tap, can stop after backgrounding, and may not list its voices at all; Hindi
  exists only if the phone has it. The dev-only `__breathSpeech` log records
  whether each utterance started or errored, and `/dev/breathe-sound` shows
  what the device offers, so a failure on the phone is legible rather than
  silent.
- The tanpura is synthesised, not a recording, and the beds loop a six-second
  noise buffer.
- A practice of your own is the four-slot shape (in, hold, out, hold): no
  nostril sides, no two-part inhale, no reordering. Ours can be retimed but not
  restructured.
- You can keep twenty of your own.
- **A routine's steps are ours, never yours.** `resolveRoutine` looks only at
  built-in practices, so a practice you made cannot be a step. Your *timings*
  for a built-in are honoured.
- **A routine cannot be repeated from History.** The log records the routine's
  name but not its slug, so the detail page leaves "Practise again" off rather
  than sending you somewhere wrong.
- **A routine's length is not adjustable.** That is the point of it being a
  routine, but it means a five-minute Downshift cannot be made three.
- **Kapalabhati's tempo is a judgement call.** Twenty pumps at one a second is
  a conservative reading of how it is taught; nobody has yet done a round on a
  real device and said whether the knocks are followable or the pulse is a
  flicker. Checklist items 22-27 in `BREATHE-SPEC.md` cover it.
- **A pumping practice cannot be retimed**, by design, so someone who wants
  thirty pumps cannot have them.
- **How the shapes actually look is unproven.** Every number behind them was
  measured, but the Browser pane was hidden for all of it, so nobody has yet
  watched a square close its corners on the phase changes at full speed on a
  phone. Checklist items 28-33 in `BREATHE-SPEC.md` cover it.
- **A finished course cannot be restarted.** `advance_journey_day` only ever
  moves forward, and no reset exists. Inventing one nobody asked for felt worse
  than leaving the course finished with its practices still on the tab, but it
  is a small addition if it is wanted.
- **The course has not been lived.** Every state was reached by setting
  progress directly; nobody has yet done day one, come back tomorrow and found
  day two open. That is a seven-day test only Dhananjay can run, and checklist
  items 34-40 in `BREATHE-SPEC.md` are written for it. Item 37 — that day two
  refuses to open on the same day — is the one that matters, because it is the
  rule the whole thing rests on.
- **A journey day is not marked in History.** The log records the practice, not
  which day of which course it was, so History reads "Box Breathing" rather
  than "Day 4 of Breath foundations". Tagging it would mean two more columns
  and two more arguments on `record_breathing_practice`; the course page is
  where progress lives, and it was not worth that.
- **A transient error on the pattern query takes the whole Breathe tab down.**
  `src/app/breathe/page.tsx` throws on `patternsRes.error`, which is
  deliberate, but it means a momentary Supabase failure — a `JWT issued at
  future` clock skew was seen once on production — shows a full-page error
  rather than a degraded tab. It recovers on reload and the error screen offers
  one. `BREATHE-SPEC.md` §21.2 records the occurrence.
- **History says "breaths" for a pumping practice.** A Kapalabhati session
  reads "60 breaths" rather than "60 pumps", because the history row has the
  practice's name but not its phases, so it cannot tell that it pumps. The
  ending screen and the detail page both get this right; only the list does
  not.
- **No practice has been started on production.** The player is verified end to
  end in the harness and the saving path was proven signed in on localhost, but
  nothing has been run on the deployed site, deliberately — starting day one of
  the course would consume it before Dhananjay could see it.
- Phase 3 is complete. Recorded voice clips are deliberately not in it —
  `BREATHE-SPEC.md` §16.5 says why and what it needs from Dhananjay.

## Change log

- **2026-09-12, production.** The whole section checked on
  abhyas-indol.vercel.app signed in as Dhananjay, deployment `55d202e`.
  `BREATHE-SPEC.md` §21 records what was checked. Fixed: four literal `--` in
  the seeded course text (migration `20260918100000_breathe_journey_dashes`, a
  correction rather than an edit because the original insert ends in `on
  conflict do nothing`), and "1 breaths" in `SessionRow`. The shapes were seen
  rather than only measured for the first time.

- **2026-09-12, phase 3d.** Breath foundations, on `breathe/journey`,
  completing phase 3: a seven-day course, in order and one a day, with the last
  day chosen from your own check-ins. Migration
  `20260918090000_breathe_journey` applied; the two course rules live in
  `advance_journey_day` and were tested as the real user against the live
  database. Fixed while testing: the tab bar missing from the routine setup
  page, a routine's practice screen loading the wrong skeleton, and four
  practices missing from the dev fixture that had been hiding two routines from
  the harness.

- **2026-09-12, phase 3b.** A signature shape per practice, on
  `breathe/shapes`: one `BreathShape` component with a single `paint` method,
  a `shape` column making it content rather than code, and silhouettes on the
  cards. Migration `20260917090000_breathe_shapes` applied. `RING_R` and
  `RING_C` removed from the theme, now that the ring is normalised with
  `pathLength`.

- **2026-09-12, phase 3c.** Kapalabhati, on `breathe/kapalabhati`: the `pump`
  and `rest` phase kinds, lengths chosen in rounds, a knock per pump, and the
  one-time safety confirmation. Migration `20260916090000_breathe_kapalabhati`
  applied. The gate was accepted signed in and confirmed in the database. Fixed
  while testing: two screens counting pumps as "breaths".

- **2026-09-12, phase 3a.** Routines, on `breathe/routines`: four seeded
  sequences, the hand-off between steps, one session with a log per step, and
  the History and home-screen changes that follow from it. Migration
  `20260915090000_breathe_routines` applied. Fixed while testing: a step
  written in breaths displayed in seconds, and an ending that claimed "All 2
  steps" after being cut short.

- **2026-09-12, later still.** Phase 2b, completing phase 2: your own timings,
  your own practices, the "for right now" suggestion, what works for you, and
  four more practices (Extended Exhale, Ujjayi, Anulom Vilom, Sheetali).
  Migration `20260914090000_breathe_your_own` applied. Fixed while testing: the
  edit form put a saved practice's phases in the wrong slots.
- **2026-09-12, later.** Phase 2a: Ocean, the four beds with their own volume,
  voice in English and Hindi, and Bhramari's hum. Migration
  `20260913090000_breathe_sound` applied. Fixed while testing: a pitch
  measurement that reported half the true pitch, a hydration failure in the
  lab, and a missing field on the "Again" card.
- **2026-09-12.** Phase 1 built and verified. During testing:
  - The practice layout became a column so it can't overlap on short screens.
  - iOS detection moved from `navigator.platform` to the user agent.
  - A comment claiming the History embed was ambiguous was corrected.
