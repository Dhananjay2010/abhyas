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
| `src/lib/breathing/audio.ts` | The shared AudioContext, `scheduleGlide`, `scheduleBell`, dev-only cue log |
| `src/lib/breathing/pattern.ts` | Types, row mapping, `parsePhases`, preferences, session URL options, moods |
| `src/lib/breathing/stats.ts` | Week strip, minutes this week, streak |
| `src/lib/breathing/validation.ts` | Practice and preference rules, shared by client and server |
| `src/lib/breathing/client.ts` | `uuid()` without a secure context, iOS detection, the "opened from inside the app" flag |
| `src/lib/breathing/theme.ts` | Session colours and ring geometry, importable by server components |
| `src/app/breathe/page.tsx`, `breathe-home.tsx` | The tab |
| `src/app/breathe/prefs-sheet.tsx`, `controls.tsx`, `rhythm-preview.tsx`, `use-media.ts` | Shared pieces |
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

## Known gaps

- **Not run signed in.** The app has not written a practice through its own UI
  on a real account. The phone checklist is in `BREATHE-SPEC.md` §13.
- **Real-device behaviour is unproven:** iOS silent switch and audio unlock,
  vibration, the wake lock across a long practice, and locking the phone
  mid-practice.
- **Keyboard activation of the focused Resume button is unverified.** The
  automation's synthetic Enter and Space didn't activate it. A click does.
- Sheets move focus in but don't trap it.
- The streak window is 370 days.
- Practices recorded before `breathing_logs` existed show as "Breathing" with no
  details.
- Phase 2 is not built: Ocean, ambience, voice, the timing editor, "Create your
  own", the recommendation, new practices and calm-shift.

## Change log

- **2026-09-12.** Phase 1 built and verified. During testing:
  - The practice layout became a column so it can't overlap on short screens.
  - iOS detection moved from `navigator.platform` to the user agent.
  - A comment claiming the History embed was ambiguous was corrected.
