# BREATHE-SPEC.md — the Breathe tab

**Status:** **Phase 3 is complete.** Phases 1, 2a, 2b, 3a (routines), 3c
(Kapalabhati), 3b (shapes) and **3d (the seven-day course)** are all built and
verified. Recorded voice clips are deliberately excluded and 16.5 says why.
Most of this still wants a look on a real phone (section 13).
**Branches:** phases 1 and 2 merged as `d26d898`, phase 3a as `f77a64d`, phase
3c as `9d4ebed`, phase 3b as `9817818`. Phase 3d is on `breathe/journey`, cut
from `main`.
**Scope:** The breathing section only. Other screens are touched only where
breathing data shows up in them, and each of those was a decision (section 9).
**Implementation record:** [context/16-breathe-tab.md](context/16-breathe-tab.md)
**Last updated:** 2026-09-12

This document is the running record for the breathing work. It started as a
review of what existed (sections 1–3) and a proposal (sections 4–8). Once you
agreed it, it became the spec, and every finding and decision is added here as
it happens.

---

## 1. How the review was done (2026-09-11)

- Read every file in the breathing path: `src/app/breathe/*`,
  `src/app/dev/breathe/*`, the seed data in
  `supabase/migrations/20260908090200_seed_reference_data.sql:51-85`, the
  schema, `context/12-yoga-and-breathing.md`, and the places breathing shows up
  elsewhere (Today, History, Settings, the bottom nav).
- Ran the real `BreathingRunner` in the `/dev/breathe` harness in the in-app
  browser. The pattern list was checked at 375×812. The run itself was watched
  at desktop width, because clicks under mobile emulation timed out in the
  in-app browser. It was run through setup, three cycles of Box Breathing, and
  the finish screen.
- Checked the six live patterns against the 2026-09-10 database backup.
- **Not done:** nothing was run against a signed-in account, since sign-in isn't
  possible from here. B1 below came from reading the code. It was later
  confirmed in the database (section 12).

---

## 2. The flow before this work

| Step | What the user saw |
|---|---|
| **Get there** | Only from Today: the "Anytime → Breathing" tile, or "Breathing instead" on a yoga day. There was no tab. While breathing, the nav lit up **Today**. |
| **Choose** | Six text cards of equal weight. Each showed a name, a benefit line and counts like `4-7-8`, with no units and no duration. |
| **Set up** | Description, benefit, a grey caution box, then "How many cycles?" as a segmented control. The time for each option was in 10px text underneath. Then Start. |
| **Breathe** | An orange circle scaled up and down with "Breathe in" and a large countdown number inside it, "Cycle 1 of 10" below, and a Stop button. The tab bar stayed visible and working. There was no sound, and haptics only worked on Android. |
| **Finish** | "Done. 10 cycles of Box Breathing." and a "Back to patterns" button. The session saved in the background. |

---

## 3. Findings

### 3.1 Bugs — all seven fixed in Phase 1

| # | Bug | How Phase 1 fixed it |
|---|---|---|
| **B1** | Finishing a breathing session could overwrite an unfinished workout. The old action reused *any* unfinished session for today and rewrote it as a completed "Breathing" session, taking the workout's logged sets with it. Yoga had been fixed for this; breathing hadn't. | Saving now goes through one database function, `record_breathing_practice`. It reuses only a *planned breathing slot* and inserts a new session otherwise. This was tested as your user against the live database: the in-progress workout was untouched and the practice got its own row. |
| **B2** | Nadi Shodhana labelled a whole cycle "Left nostril", including the exhale, which goes out through the right. | Every phase carries its own side in the data. The screen says "In through the left", "Out through the right" and so on, and a small nostril guide lights the open side. |
| **B3** | 4-7-8 offered 20, 30 or 65 cycles directly under a caution that said to start with four. | 4-7-8 is chosen in breaths (2, 4, 6 or 8) and capped at 8. The cap is enforced in three places: the setup screen, the session URL parser and the database's `max_cycles`. |
| **B4** | One tap on Stop threw the practice away. | Stop became Pause, which opens a sheet: **Resume · End and save · Discard**. |
| **B5** | The tab bar stayed live during a practice. | The practice is its own full-screen route with no tab bar. |
| **B6** | The back button left the section. | Every screen has its own URL. During a practice, back opens the pause sheet. Done and Discard return you to where you started. |
| **B7** | The sigh was paced as one inhale, and Bhramari said "Breathe out" instead of hum. | The sigh is paced as an inhale to 80%, then a "Sniff to top it up" to full, then a long exhale. Bhramari's exhale says "Hum, mmmm". |

### 3.2 Experience findings

| # | Finding | Phase 1 |
|---|---|---|
| U1 | Hard to find | A Breathe tab, second in the bar |
| U2 | The list gave nothing to choose with | Intent filter, each practice's length for you, a live rhythm preview, and level and intents shown on setup |
| U3 | Lengths were chosen in cycles | Lengths are chosen in minutes (1, 3, 5, 10 or custom); 4-7-8 in breaths |
| U4 | No settling in | A 5-second settle-in with three soft ticks, skippable |
| U5 | Mechanical motion; frozen during holds | Sine-eased motion at the display's frame rate. A ring fills over every phase, holds included |
| U6 | The countdown was the loudest thing on screen | The count is optional and small |
| U7 | No sense of time left | A time-left counter and a progress bar |
| U8 | Eyes had to stay open | Tones (a rising and falling glide, and bells at the holds). Vibration where supported |
| U9 | Flat ending | Summary, "How do you feel now?", this week's strip, Again or Done |
| U10 | History forgot what you did | Rows named by practice, with m:ss and breaths; a detail page shaped for breathing |
| U11 | Preferences scattered | They live in the Breathe tab. **Per-pattern timings are still Phase 2** |
| U12 | Accessibility | Phases announced to screen readers; a reduced-motion alternative |
| U13 | The orange worked against calm | A cool palette for the session; orange kept for buttons |

### 3.3 Housekeeping

- `PERF-SPEC.md` said "36 breathing patterns". The table has 6. Corrected
  there on 2026-09-12.

---

## 4. Design principles for Breathe

1. **Your eyes can close.** Every instruction is available as sound, and as
   vibration where the phone supports it.
2. **Minutes, not maths.** You pick a duration, and the app works out the
   breaths.
3. **One tap to start.** Most visits are "I need to calm down *now*".
4. **The guide moves like a breath.** Picture and sound both ease in and out,
   and a hold still visibly moves.
5. **Never lose a practice to a mis-tap.** Stop becomes Pause, and Back pauses
   too.
6. **Be honest about what works and what's risky.** Show evidence where it
   exists and cautions where they matter, and build the limits into the
   controls.
7. **Calm is the brand here.** Cooler colours, slower motion, fewer words.

---

## 5. Proposed experience

The full proposal as agreed. Section 11 records where the Phase 1 build differs
from it and why.

### 5.1 A Breathe tab

`Today · Breathe · History · Progress · Settings`, active on `/breathe` and a
practice's setup page, and absent during a practice. Today's "Anytime →
Breathing" tile stays as a second way in.

### 5.2 Breathe home — `/breathe`

- The week's minutes and your streak.
- **Again**: your last practice at its last length, one tap. (The "For right
  now" recommendation is Phase 2.)
- Intent chips.
- The practices, each with a live preview of its rhythm.
- A week strip.

### 5.3 Practice setup — `/breathe/[slug]`

- A preview of the rhythm, with timing chips.
- How to do it, and why it works (with a source where one exists).
- Caution, where it applies.
- Length in minutes, with a cap where the practice has one.
- Guidance.
- **Adjust timing** — a stepper for each phase the practice has, in
  half-seconds, saved as yours and used every time. Reset puts ours back.
- Start.

### 5.4 The practice — `/breathe/[slug]/session`

- Settle-in.
- The orb, a ring that fills over each phase, and a time-left bar.
- Words for each phase that come from the pattern.
- Controls that stay out of the way.
- A pause sheet, with Back opening the same sheet.
- Auto-pause when the app is hidden.
- A wind-down at the end.

### 5.5 Sound and voice

All of this is built (phase 1 gave Tones; phase 2a the rest):

- **Tones** — a glide that rises and falls with the breath, with a bell at each
  hold.
- **Ocean** — a wave that swells as you breathe in, holds its level through a
  hold, and ebbs as you breathe out.
- **Voice** — the phone speaking each cue, in English or Hindi.
- **Off**.
- **A bed underneath, at its own volume:** rain, waves, a deep hush, or a
  tanpura-style drone.
- **Bhramari's exhale hums**, in every mode, so you have a pitch to match.

Everything except the voice is synthesised with Web Audio: nothing to host,
license or download. The voice is whatever the phone already has.

### 5.6 The ending

- A summary.
- A check-in: after the practice by default, before and after as an option.
- This week's strip.
- The save status, with Retry.
- **Again · Done**.

### 5.7 Content

Ten practices: the original six, fixed, plus **Extended Exhale, Ujjayi, Anulom
Vilom and Sheetali**, added in phase 2b. On top of those, any number of your
own. The routines and Kapalabhati are Phase 3. Wim Hof-style breathing is
excluded.

### 5.8 Progress, inside the tab

The week strip, minutes this week and the streak are built. Calm-shift, totals
and your most-used practice are Phase 2.

### 5.9 Accessibility

Built:

- A live region announces each phase.
- A reduced-motion alternative.
- Words always on screen.
- Large targets.

### 5.10 Visual language

The breathing session uses cool `--color-breath-*` tokens. The orange accent is
kept for primary actions.

---

## 6. Technical approach — as built

| Part | Where | Notes |
|---|---|---|
| Routes | `src/app/breathe/page.tsx`, `[slug]/page.tsx`, `[slug]/session/page.tsx` | Session options travel in the URL (`?cycles=19&sound=tones&count=1&vib=1&settle=1&checkin=after`), so what was chosen is what runs |
| Timeline engine | `src/lib/breathing/engine.ts` | Pure functions of time; replaces the interval state machine behind the old frozen-timer and double-count bugs |
| Clock | `src/lib/breathing/clock.ts` | A pausable stopwatch; paused time is never counted |
| Patterns and preferences | `src/lib/breathing/pattern.ts` | Row mapping, phase validation, URL options, check-in scale |
| Sound | `src/lib/breathing/audio.ts` | One shared context, unlocked by the Start tap; cues scheduled on the audio clock. Tones, ocean swells, the hum and the four beds |
| Voice | `src/lib/breathing/speech.ts` | The phone's own voice, warmed up by the same tap; what to say, in English and Hindi; a report of what the device offers |
| Stats | `src/lib/breathing/stats.ts` | Week strip, minutes this week, streak in calendar days |
| Validation | `src/lib/breathing/validation.ts` | Shared by the browser and the server |
| Server actions | `src/app/breathe/actions.ts` | `recordBreathingPractice`, `rateBreathingPractice`, `updateBreathingPrefs` |

**Schema** — migration `20260912090000_breathe_phase_one.sql`, additive only,
applied 2026-09-12:

| Change | Purpose |
|---|---|
| `breathing_patterns` + `subtitle`, `phases jsonb`, `intents text[]`, `max_cycles`, `how_to text[]`, `why`, `evidence_label`, `evidence_url` | Carries everything the new screens show. The four legacy timing columns are untouched, so `main` keeps working |
| `breathing_logs` (child of `sessions`) | What each practice was: pattern, breaths, seconds, ended early, both check-ins, sound. Same owner trigger and four RLS policies as every other child table |
| `user_settings` + `breathing_guidance`, `breathing_show_count`, `breathing_vibrate`, `breathing_settle_in`, `breathing_check_in`; a 1–60 range on `meditation_default_minutes` | The Breathe tab's preferences |
| `record_breathing_practice(...)` | `SECURITY INVOKER`: writes the session and the log in one transaction, and carries the B1 fix and safe retries |

Phase 2a added migration `20260913090000_breathe_sound.sql`, also additive:

| Change | Purpose |
|---|---|
| `breathing_guidance` widened to `tones`, `ocean`, `voice`, `off`, in both `user_settings` and `breathing_logs` | The new modes, and a record of which one a practice used |
| `breathing_ambience`, `breathing_ambience_volume`, `breathing_voice_lang` | The bed, how loud, and which language speaks |
| `"hum": true` on Bhramari's exhale | A phase can say it is hummed, so the player hums with you instead of gliding |

Differences from the proposal in section 6 are listed in 11.2.

---

## 7. Phasing

**Phase 1 — done (this branch).** Everything in section 11.1.

- **Moved into Phase 1 from Phase 2:** remembered preferences, and part of
  breathing stats (the week strip, minutes this week, the streak). Decision Q9
  needed preferences to have a home, and the ending needed the week.
**Phase 2a — sound — done (branch `breathe/sound`).** Ocean, the four beds with
their own volume, voice in English and Hindi, and Bhramari's hum. Section 14
records how it was built and what was verified.

**Phase 2b — done (same branch).** Your own timings for any practice, your own
practices, the "for right now" suggestion, what works for you, and four more
practices. Section 15 has the detail. **Phase 2 is now complete.**

- Not done, and deliberately so: distinct vibration patterns. There is one
  pulse per phase kind, which is enough on the phones that vibrate at all.
**Phase 3 — complete.** Designed in section 16, built in this order:

  - **3a** Routines — 16.1. **Done**; section 17.
  - **3c** Kapalabhati behind a safety confirmation — 16.3. **Done**;
    section 18.
  - **3b** A signature shape per practice — 16.2. **Done**; section 19.
  - **3d** The seven-day "Breath foundations" course — 16.4. **Done**;
    section 20.
  - Recorded voice clips — **not in this phase**; 16.5 says why, and what it
    needs from you

---

## 8. Safety

- **Built:** the one-time note before a first practice ("Breathe sitting or
  lying down, never while driving or in water…").
- **Built:** a caution for each practice, with an icon.
- **Built:** the 4-7-8 cap, enforced by the controls, the URL parser and the
  schema.
- **Built:** a one-hour ceiling on any single practice.
- Hyperventilation with breath retention remains excluded.

---

## 9. Decisions — agreed 2026-09-12

You agreed all nine and the six judgement calls.

| # | Decision |
|---|---|
| Q1 | The tab is second and called "Breathe" |
| Q2 | Phase 1 first, then your review on a phone, then Phase 2 |
| Q3 | The phone's own voice now, in English and Hindi, with recorded clips later |
| Q4 | Kapalabhati in Phase 3, behind a one-time safety confirmation |
| Q5 | The check-in is after the practice by default; before and after is an option |
| Q6 | The training-streak rule is left alone; Breathe has its own streak |
| Q7 | History names the practice and has a breathing detail page |
| Q8 | Cool palette for the session; orange for buttons |
| Q9 | Breathing preferences move from Settings into the Breathe tab |

Judgement calls:

1. Minutes replace cycles.
2. A practice auto-pauses when the app is hidden.
3. "End and save" needs one full round.
4. Sound is synthesised.
5. Wim Hof-style breathing is excluded.
6. Today's tile stays.

---

## 10. Verification plan

- The engine is covered by timeline tests.
- The browser checks are run at 375px.
- B1 is checked against the real database.
- Sound, vibration, wake lock and locking the phone need a real phone.

What was actually done is in section 12.

---

## 11. Phase 1 — as built

### 11.1 What changed for the user

**The tab**

- A fifth tab, Breathe, second in the bar.
- It lights up on the tab and on a practice's setup page, and disappears for
  the practice itself.

**Breathe home**

- "18 min this week · 3-day streak" and a Monday-to-Sunday dot strip.
- An **Again** card that starts your last practice at its last length in one
  tap. Someone with no history gets a "New here? Start with this" card for the
  physiological sigh instead.
- Intent chips: All, Calm, Sleep, Focus, Recover, Balance. Energy is hidden
  until a practice has it. The chosen filter is kept in the URL, so it survives
  coming back.
- Each practice is a card with a small orb breathing its real rhythm, the
  length you'd get, a subtitle, and its intents.
- A preferences sheet (the sliders icon): usual length, sound, seconds count,
  settle-in, check-in, and vibration where the browser supports it. Each change
  saves as it's made.

**Practice setup**

- The rhythm as chips ("In 4s · Hold 7s · Out 8s"), with L and R for Nadi
  Shodhana.
- Level and intents, the benefit, and the caution with an icon.
- The first-practice safety note.
- "How to do it", open for a practice you've never done.
- Length:
  - 1, 3, 5 or 10 minutes, or Custom (a stepper from 1 minute up to the
    pattern's cap or an hour).
  - For 4-7-8, 2, 4, 6 or 8 breaths.
  - The breaths and the exact time are shown for the chosen length.
- Guidance: sound (Tones or Off), with a note when the phone can't play it, and
  the seconds count (Show or Hide). Both are remembered.
- A Start button that unlocks sound with the same tap.
- "Why it works", with the Balban et al. 2023 link for the sigh.

**The practice**

- An optional "How do you feel right now?" first.
- A 5-second settle-in, with three soft ticks and "Start now" to skip it.
- The orb, its glow and a background that brightens with the breath. A ring
  fills over each phase. A time-left counter and a progress bar. The words for
  each phase fade in.
- A nostril guide for Nadi Shodhana.
- Tones:
  - A soft glide rising on the inhale and falling on the exhale.
  - A high bell for a hold after breathing in, a low bell for a hold after
    breathing out.
  - A low bell at the end.
- Vibration on each phase where the phone supports it. The screen stays on.
- Tapping the screen shows or hides the controls: sound, pause, end.
- Pause:
  - The pause sheet offers **Resume · End and save · Discard**.
  - The back button and Escape open it; so does leaving the app, which pauses
    the practice.
  - "End and save" needs at least one full round.
- A 10-second wind-down ("Let your breath return to normal").
- The ending:
  - A summary.
  - "How do you feel now?", with "Tense → Calm" when you checked in before too.
  - This week's strip.
  - "Saved to your history." or an error with **Try again**.
  - Again and Done.
- Done returns to the page you came from.
- A reloaded practice asks for one tap (**Begin**) before sound can play.

**History and Settings**

- History rows for breathing read "Box Breathing · Breathing · 5:04 · 19
  breaths".
- A practice's detail page shows time, breaths, sound, the check-in, whether
  it ended early, and **Practise again**.
- Settings no longer has "Breathing session length". It points to the Breathe
  tab instead.

### 11.2 Where the build differs from the proposal, and why

| Proposal | Built | Why |
|---|---|---|
| A `user_breathing_prefs` table | Five columns on `user_settings` | Every user already has exactly one settings row, created at sign-up, and five fields did not justify a second table with its own policies |
| `user_breathing_patterns` | Not yet | "Create your own" is Phase 2 |
| `default_minutes` and `visual` columns | Not added | Nothing in Phase 1 reads them. A length now starts at your last one for that practice, else your usual minutes |
| Two-column practice grid (5.2 wireframe) | One column | Names like "Coherent Breathing" and their one-line subtitles wrap badly at half of a 375px screen. The 52px rhythm orb reads well in a row |
| (Not in the proposal) | `record_breathing_practice` database function | One place to make the write atomic, fix B1, and make a retry safe (the client picks the log id) |
| Preferences remembered in Phase 2 | Phase 1 | Q9 moved the one breathing setting out of Settings, so it needed a home |
| Streak and week strip in Phase 2 | Phase 1 | The ending shows the week |
| The orb at a fixed 300px | `min(300px, 36dvh)`, in a column layout | Found in testing: on a 434px-tall screen the words sat under the controls |

---

## 12. Phase 1 — verification performed

**Unit tests.** `npm test` gained `test:breathing`, 18 groups, and every suite
passes. The breathing groups cover:

- Box, 4-7-8, Coherent, sigh, Nadi and Bhramari timelines, phase by phase
- Fractional seconds over 100 cycles
- The end of a practice
- Sound lookahead
- Lengths, the cap and the starting length
- Easing
- The clock, including paused time
- The week and the streak
- Phase validation
- Every phase list in the migration parsing and building
- Session URLs clamped to the cap and to one hour
- Server-side input rules
- Ids generated without a secure context

**Against the live database** (Supabase CLI, linked project):

- The migration was applied, then checked. All 6 patterns have phases, intents
  and how-to. 4-7-8 has `max_cycles = 8` and the sigh has its evidence link.
  All 13 CHECK constraints are present. `breathing_logs` has RLS on, 4 policies
  and the owner trigger. The function is `SECURITY INVOKER`, executable by
  `authenticated` and not by `anon`.
- `record_breathing_practice` was called **as your user, under RLS**, inside a
  block that always rolls itself back. All 15 results were as expected:
  - An in-progress workout stays `in_progress` / `weights`.
  - The practice gets its own completed session.
  - The log is written with the pattern's name and an owner taken from the
    session.
  - A retry with the same log id returns the same session and writes nothing.
  - A planned breathing slot is reused.
  - Ended-early and the mood are saved.
  - Zero cycles, an unknown sound mode and an unknown pattern are all rejected.
  - A stranger sees no logs and no sessions.
  - Afterwards, no rows existed on the test dates and `breathing_logs` held 0
    rows.
- The live API refuses the function to `anon` (42501). The History embeds and
  the setup page's join-and-filter query run without errors.

**In the browser** (the in-app Chromium, dev harness mounting the real
components):

- **Home at 375px.** The five tab labels fit on one line and Breathe is marked
  current. The Again card shows. The chips filter to the right practices and
  write `?intent=` into the URL; a URL with `?intent=sleep` restores the
  filter.
- **Preferences sheet.** Focus goes to the heading. It shows the saved choices.
  Choosing Sound: Off sends `{"guidance":"off"}` and shows "Saved". Escape
  closes it.
- **Setup for 4-7-8.** The lengths are 2, 4, 6 and 8 breaths ("4 breaths ·
  1:16"). The safety note and the open how-to show for a first practice.
- **Nadi Shodhana at 375px.** "Hold, both sides closed" shows with both
  nostrils dim, then "Out through the right" with Right lit. The tab bar is
  gone.
- **Sound timing.** After the Start tap the audio context is `running`. The
  scheduled cues landed within about 2ms of the timeline:
  - ticks at −3, −2 and −1s
  - the inhale glide at 0 (196→294 Hz, 4s)
  - the high bell at 4s
  - the exhale glide at 8s (294→196 Hz)
  - the low bell at 12s
- **Back.** The URL doesn't change, the history length stays the same, the
  pause sheet opens with focus on Resume, and every sounding tone is stopped.
- **End and save.** The action receives `cycles 2 / planned 19, breaths 2,
  seconds 43, endedEarly true, guidance tones`. The ending reads "Every breath
  counts."; the week strip adds today.
- **Check-in.** Choosing Calm sends the rating under the same log id.
- **Done.** It returns to the setup page, and the tab bar comes back.
- **Cold load.** A reloaded practice shows **Begin**; the tap starts sound.
  Leave goes to the Breathe tab.
- **Failed save.** The error shows with Try again. A mood chosen while the save
  was failing is sent once the retry succeeds, and both save attempts carry the
  same log id.
- **Before and after check-in.** The mood screen comes first. The ending shows
  "Tense → Calm", and the saved record carries `moodBefore: 1`.
- **Reduced motion** (preference overridden in the page). The orb holds at
  `scale(0.8)` while its opacity follows the breath (0.69 → 0.98), and the glow
  stays still.
- **Layout.** With a 454px-tall viewport the lowest text is at 311px and the
  controls start at 350px. At 812px the orb is 292px, the text ends at 562px and
  the controls start at 708px.
- **Sound lab** (`/dev/breathe-sound`). The real tones were rendered by the
  browser's Web Audio engine and measured, and **11 of 11 checks passed**:
  - there is sound (peak 0.14) and it never clips
  - no clicks
  - the inhale rises (206→276 Hz) and the exhale falls (279→209 Hz)
  - it fades in
  - it is silent between cues
  - the bell decays
  - stopping a tone silences it
- **History.** The rows and the three detail variants (full, ended early, from
  before logs) render. The Settings note and link render, and the old control is
  gone.

**Static checks:** typecheck, eslint and `next build` are clean.

**Found and fixed while testing:**

- The practice screen overlapped its controls on short screens. It now uses a
  column layout and an orb sized to the viewport.
- The iPhone check read `navigator.platform`, which an emulated Android phone
  on a Mac reports as "MacIntel". It now reads the user agent.
- A code comment claimed the History embed needed its foreign-key hint to avoid
  ambiguity. The live API showed it doesn't: PostgREST treats a table as a
  many-to-many join only when both foreign keys are in its primary key. The
  hint is kept as a guard and the comment now says so.

---

## 13. Known gaps, and what only your phone can prove

- **Signed in: closed on 2026-09-12.** You practised on localhost while signed
  in, and the app wrote it through its own screens: Physiological Sigh, 7
  breaths, 63 seconds, tones, your "Okay" check-in saved, on a completed
  meditation session for 2026-09-12 — one `breathing_logs` row, one session,
  nothing else touched. That was the phase 1 and 2a path end to end on a real
  account.

  Still not exercised on a signed-in account: the phase 2b screens (your own
  timings, your own practices), every sound mode but tones, and **a routine
  actually run through** (phase 3a). Those rest on the harness, on the database
  function run as your user in SQL, and on the queries checked against the live
  API.

- **The Browser pane was hidden for the phase 3a session**, which makes the
  page a hidden document: `requestAnimationFrame` never fires and the practice
  auto-pauses, both correctly. The sequence was watched by shimming
  `requestAnimationFrame` onto a timer and stubbing `document.hidden`, with
  scripted clicks rather than real taps. **The motion itself, and real taps, are
  unproven** — 17.3 says so too.
- **The automated Enter and Space keys did not activate the focused Resume
  button.** Clicking it works. My key handler leaves a focused button alone, so
  a real keyboard should work, but the automation could not prove it.
- The sheets move focus in but do not trap it.
- The streak looks back at most 370 days.
- Practices recorded before this work show as "Breathing" with no details.
- Per-pattern timing editing (`SPEC.md` §9.4) is still open: Phase 2.

**Sound, specifically** (phase 2a):

- **Nothing about the voice can be proven from here.** iOS speaks only from
  inside a tap, and can stop speaking after the app has been in the background;
  Safari often will not list its voices at all, so a language cannot always be
  chosen; and Hindi is present only if the phone has it installed. The practice
  warms speech up on Start and again on Resume, the screens say what the device
  reports, and `/dev/breathe-sound` shows it — but your phone is the test.
- The tanpura is a synthesised approximation, not a recording.
- The beds loop a six-second noise buffer. It is noise, so the loop is not
  audible, but it is a loop.

**Checklist for your phone** (iPhone Safari, and an Android phone if you have
one):

1. Breathe tab → Box Breathing → 1 min, Tones on, silent switch **off**. Do you
   hear a tone rise as you breathe in, fall as you breathe out, and a bell at
   each hold?
2. The same with the silent switch **on**. On iOS 17 or later it should still
   play.
3. Lock the phone mid-practice and unlock it. You should see **Paused**.
4. Swipe back (or press back) mid-practice. It should pause, not leave.
5. End and save after two breaths. History should show the practice by name,
   with its time and breaths.
6. **B1 on real data:** start a workout, log one set, then do a breathing
   practice. Today should still offer *Resume session*, and History should list
   the two separately.
7. Leave a 5-minute practice untouched. The screen should stay on throughout.
8. Android only: the phone buzzes on each phase.

**And for the sound (phase 2a):**

9. Open `/dev/breathe-sound` on the phone. It measures every sound, lists the
   voices that phone actually has, and plays each one on a tap. This needs no
   sign-in, so it works from the dev server over your network.
10. A practice with **Ocean**: the wave should swell as you breathe in, sit
    still through a hold, and ebb as you breathe out.
11. A practice with **Voice**, in English and then in Hindi. If Hindi is
    missing, the screen should say so rather than falling silent.
12. Any mode with **Rain** or **Tanpura** underneath, and the volume changed.
13. Bhramari: the hum should sound under the exhale, in any mode.
14. Pause mid-practice: everything, including the bed, should go quiet, and
    come back on Resume.

**And for the routines (phase 3a). These have never been run signed in, so they
matter most:**

15. Breathe → **Reset** → Start. It is the shortest, about three minutes. Watch
    the seam between its two steps: the first should wind down briefly, then a
    screen saying "Physiological Sigh done", naming Coherent Breathing, and
    counting down from six. It should start the second step without a tap.
16. The header during a routine should read "Reset · step 1 of 2", with the
    small step marks under the progress bar.
17. At the end: the time and breaths should be the **whole routine**, named
    "Reset", saying "All 2 steps".
18. **History should show one entry named "Reset"**, not "Physiological Sigh",
    and opening it should list both steps with their own times.
19. Do a routine and then go back to the Breathe tab. The **"Again" card must
    not** now offer a practice at a routine's step length.
20. Start **Downshift** and press **End here** at the first hand-off. The
    ending should say "1 of 2 steps" and History should still hold what you
    did.
21. Rate a routine at the end, twice on different days. It should appear in
    "What works for you" under the routine's name.

**And for Kapalabhati (phase 3c). This one is worth doing carefully:**

22. **The gate is waiting for you.** It was accepted once from here while
    testing, then set back to `false` so you would see it yourself — so
    `/breathe/kapalabhati` should open on the safety note and offer no Start
    button until you accept it. To see it again after that, set
    `breathing_kapalabhati_ack` back to `false` in `user_settings`.
23. **One round only, the first time.** Sit upright. The count should step
    `1 / 20` to `20 / 20` at one a second, with a knock on each — this is the
    part only a real device can judge: the knocks must be audible over your own
    breathing without being sharp, and the orb's pulse must be followable
    rather than a flicker.
24. During the rest, the orb should hold still while the ring around it fills.
    If the orb pulses here, something is wrong: nothing is pacing you.
25. Try it with **Voice**. The knocks should keep playing, with "Pumping. Sharp
    out through the nose" said once at the top of the round.
26. History should read "Kapalabhati", with 20 breaths for one round.
27. If you feel dizzy, stop — and tell me, because the seeded tempo is a
    judgement call I would rather revise than defend.

**And for the shapes (phase 3b). These are the one thing a screenshot cannot
settle:**

28. Open the Breathe tab and look at the list. Every practice should have a
    different silhouette breathing its own rhythm — a rounded square for the
    box, a teardrop for 4-7-8 and the sigh, a pair of lobes for the two
    alternate-nostril ones, a ringed circle for Bhramari.
29. **Box Breathing.** The ring should draw one side of the square per phase
    and close the box exactly as a cycle ends. This is the one to judge: if the
    corners do not land on the phase changes, something is off.
30. **Nadi Shodhana.** The lobe on the open side should be clearly brighter,
    and both should be equal through a hold.
31. **Bhramari.** Rings should spread outward while you hum and stop between
    breaths.
32. **Kapalabhati.** A flash on every pump, dark through the rest.
33. Turn on Reduce Motion in iOS accessibility settings and do a minute. Nothing
    should move: the shape should brighten and dim instead.

**And for the course (phase 3d). This one takes a week, which is the point:**

34. The Breathe tab should show **Course · Breath foundations · 7 days** above
    the routines, with "Day 1: The fastest way down". It disappears while you
    filter by an intent, because a course is not about one.
35. Open it. All seven days should be listed with what each teaches, day one
    open and the rest dimmed. **Day seven should name a real practice** — with
    no check-ins yet it will say so and fall back to Coherent Breathing.
36. Do day one. The header should read "Breath foundations · day 1 of 7", and
    the ending "Day 1 of 7 · 6 to go".
37. **Go back in.** Day two should say it opens tomorrow, and there should be
    no Start button. This is the rule that makes it a week; if it lets you
    straight into day two, tell me.
38. Tomorrow, do day two. Then leave it a few days and come back — the course
    should be exactly where you left it, not reset.
39. Somewhere in the middle, **stop a day part-way** with End and save. The
    practice should appear in History and the ending should say the day counts
    when you reach the end of it. The day should still be open afterwards.
40. By day seven you will have rated six practices. **Day seven should be
    whichever one you rated best**, and say so. That is the only part of this
    the app cannot know in advance, and the only part worth the week.

---

## 14. Phase 2a — sound, as built

### 14.1 What changed for the user

- **Sound is now four choices**: Tones, Ocean, Voice, Off — on the setup screen
  and in the preferences sheet, which share one control so they cannot drift
  apart.
- **Ocean** follows the same eased curve as the orb: louder and brighter as you
  fill, still through a hold, ebbing as you empty. No bells; the sea itself
  tells you where you are.
- **Voice** says short cues — "Breathe in", "Hold", "In through the left",
  "Sniff", "Hum" — in English or Hindi. The screen's longer sentence stays on
  screen; what is spoken is the short form, because a four-second breath has no
  room for a sentence.
- **A bed underneath**, at its own volume in steps of ten: rain, waves, hush or
  tanpura.
- **Bhramari hums**: its exhale is marked as hummed in the data, so every mode
  plays a quiet drone to match pitch with.
- **The screens say what the device can actually do**: whether this browser can
  play sound, whether it can speak, which voice it would use, and whether a
  Hindi voice exists. A "Hear it" button tries it there and then.
- **Voice falls back to tones** on a browser that cannot speak, and says so.

### 14.2 How it is put together

- Ocean is pink noise through a low-pass, with the gain and the cutoff both
  driven by the same eased size curve the orb uses, as a `setValueCurveAtTime`
  over the phase. A hold is simply a phase whose size does not change.
- The beds are synthesised too: rain is two filtered noise layers, waves adds a
  fourteen-second swell of its own, the hush is noise pushed down to a brown
  slope, and the tanpura is four detuned saw strings shimmering at different
  rates through a low-pass.
- Speech cannot be put on the audio clock, so a cue is spoken as the phase
  turns — within a frame of where the other modes place their sound.
- iOS grants Web Audio and speech separately, and both only inside a gesture.
  Start, Again, Begin, Resume and the sound toggle all grant both.
- Everything a practice sounds like travels in the session URL
  (`sound`, `amb`, `vol`, `lang`), so what was chosen is what runs.

### 14.3 Verified

- **Unit tests:** 19 groups now, including the new URL fields (round trip,
  junk falling back, a volume of 480 clamped to 100), every guidance value
  accepted and an invented one refused, and what the voice says in both
  languages — including that the sigh's second inhale is "Sniff" and Bhramari's
  exhale is "Hum".
- **The sound lab** (`/dev/breathe-sound`) renders every sound through the
  browser's own Web Audio engine and measures it: **18 of 18 passed.** The wave
  swells (0.0034 → 0.0123 → 0.0226), holds its level through a hold (0.0247 →
  0.0222), ebbs (0.0236 → 0.0032) and never clips; the hum sounds at 174 Hz and
  fades; all four beds fade in, play and stay well below clipping; and the
  waves bed rises and falls on its own.
- **A live Ocean practice:** the URL carried `sound=ocean&amb=rain&vol=40`, the
  rain bed started, the settle ticks played, and the swells arrived at the
  phase boundaries — with no tone glides scheduled.
- **A live Voice practice:** the warm-up spoke on the Start tap, then "Breathe
  in" at 5.0s (the moment the settle-in ended), "Hold" at 9.0s and "Breathe
  out" at 13.0s — every one started, none errored, and each matched the screen.
  Only the settle bells were scheduled, with no glides or swells.
- **Bhramari:** the hum was scheduled for its exhale, 8 seconds at 175 Hz.
- Typecheck, lint and `next build` are clean.

**Found and fixed while testing:**

- The lab's pitch measurement locked onto the tone's sub-octave partial once
  its search band was widened for the hum, and reported half the pitch. The
  sound was fine; the measurement was not. Each sound is now searched in the
  band where its fundamental actually lives.
- The lab read the device's voices during render, which the server cannot know,
  and hydration failed. It reads them through the same store as everything
  else now.
- The "Again" card built a practice without the new sound fields. Typecheck
  caught it before a browser ever did.

## 15. Phase 2b — your own practice, as built

### 15.1 What changed for the user

- **Adjust timing**, on every practice. A stepper per phase, in half-seconds.
  It edits the phases a practice already has, so it fits Nadi Shodhana's six
  and the sigh's two-part inhale as readily as a four-count square, and it
  never lets you reorder or rename them into nonsense. Saved timings are used
  every time; **Reset** puts ours back. This is what `SPEC.md` §9.4 asked for
  and never had.
- **Your own practices.** Name one, set in / hold / out / hold in half-seconds,
  and it joins the list at `/breathe/mine-<id>`, with its own rhythm preview.
  A hold at zero is simply left out. Editing and deleting live on the same
  screen; deleting keeps the practices you have already done in your history,
  because the log keeps the name it was practised under.
- **For right now** — one suggestion, with the reason on the card: after a
  workout, the sigh; late in the evening, 4-7-8; in the morning, the box;
  otherwise coherent breathing. Never the practice the "Again" card is already
  offering.
- **What works for you** — from your own check-ins: how each practice tends to
  leave you, and the average shift when you check in before as well. It appears
  only once a practice has been rated twice, because one good evening is not
  evidence.
- **Four more practices:** Extended Exhale, Ujjayi, Anulom Vilom and Sheetali.
- Your practices are marked in the list: **Yours**, or **Your timings** on one
  of ours you have retimed.

### 15.2 How it is put together

- **One table for both.** `user_breathing_patterns` holds a list of phases that
  belongs to you. With `base_pattern_id` set it is your timing for one of ours;
  without, it is a practice of your own. A partial unique index gives you one
  set of timings per practice, so saving again replaces the first.
- **`withUserPatterns`** folds your rows into ours: your timings replace ours
  on the practice itself (which keeps its own id, so history still groups it),
  and your own practices join the end.
- **One loader.** `loadPractice` resolves a slug for both the setup screen and
  the practice itself, so the two can never disagree about what a slug means.
- **The save function takes either.** A practice of your own records
  `user_pattern_id` with no built-in behind it; a retimed built-in records
  both. It refuses a practice id that is not yours, and the log keeps a
  snapshot of the name either way.
- **The suggestion is a pure function** of the hour where you are, whether you
  trained today, and what the Again card is already showing — so it is tested
  rather than eyeballed.

### 15.3 Verified

- **Unit tests:** 22 groups, all passing, including the new rules (names,
  half-seconds, a minute per phase, five minutes per breath, a way in and a way
  out), the merge of your rows into ours, every branch of the suggestion, and
  the calm-shift averages.
- **Against the live database, as you, rolled back:** a practice of your own
  logged with your row and no built-in; a retimed built-in keeping both ids; a
  retry writing nothing; a practice id that is not yours refused; a stranger
  seeing none of it; the one-timing-per-practice index holding; and B1 still
  holding — an unfinished workout untouched.
- **In the harness, by clicking:** the suggestion at 22:00 (4-7-8, "It is late…")
  and after training (the sigh); the insights section; the badges; a practice of
  your own; a retimed built-in showing 5s chips and Reset; saving with no name
  refused with nothing sent; a hold switched on and the payload carrying three
  phases with the switched-off hold dropped; timings saved (payload, then
  "Saved") and reset; and deleting, which returns you to the tab.

**The bug this found:** editing a saved practice filled the four editable slots
by position, so a practice of "in 4, out 8" showed its exhale in the hold's slot
with a second "Out" beneath it — and switching that row on would have added a
second exhale. Slots are now matched by kind, in order, and three tests hold it
there.

## 16. Phase 3 — design

Section 7 names five things. This section says what each of them actually is,
because the list alone does not decide anything. The order below is the build
order: routines first, because they are the largest addition and the one a
person would notice.

### 16.1 Routines — a sequence, not a single practice

A routine is two to four practices run back to back without leaving the
session screen. You choose the routine, not each practice inside it.

Seeded:

| Routine | Steps | About |
|---|---|---|
| Downshift after training | Physiological Sigh (5 breaths) → Extended Exhale (2 min) → Coherent (2 min) | Drop the heart rate fast, then settle |
| Wind down for sleep | Extended Exhale (3 min) → 4-7-8 (4 breaths) → Bhramari (2 min) | Long exhales, then the hum |
| Start the morning | Anulom Vilom (2 min) → Box Breathing (3 min) | Balance, then a steady edge |
| Reset in three minutes | Physiological Sigh (3 breaths) → Coherent (2.5 min) | The short one, for the middle of a day |

**How it runs.** The session screen already separates what outlives one
practice (`BreathingSession`) from one practice (`Practice`, remounted by key
for "Again"). A routine reuses exactly that: each step is a `Practice`, and
finishing one moves to the next by changing the key. Between steps there is a
short hand-off — the next practice's name, a countdown, and a Skip — rather
than the full ending screen, which appears only once at the end.

**What gets recorded.** One session for the whole routine, one
`breathing_logs` row per completed step. So History shows a single entry named
for the routine, and opening it lists the steps. Saving happens step by step,
so leaving after step two keeps steps one and two.

**Schema.** `breathing_routines` (slug, name, subtitle, about, `steps jsonb`,
intents, sort order) and `breathing_logs.routine_id` + `routine_step`.
`record_breathing_practice` gains `p_session_id`: the first step creates or
claims the session as it does today, later steps append to that session and add
their seconds to its duration. A retry is still a no-op, keyed on the log id,
so the duration cannot double-count.

### 16.2 A signature shape per practice

Today every practice is the same circle. Each will get a shape that matches
what it is, driven by the same eased `size` and `progress` the engine already
returns:

| Shape | Practices |
|---|---|
| Orb (today's) | Coherent, Extended Exhale, Ujjayi, Sheetali, and anything of your own |
| Square traced on its perimeter | Box Breathing |
| Lobes, the open side lit | Nadi Shodhana, Anulom Vilom |
| Ripples spreading outward | Bhramari |
| Teardrop, weighted to the exhale | 4-7-8, Physiological Sigh |
| A flash on every pump | Kapalabhati — added with 3c, after this table was written |

A `shape` column on `breathing_patterns`, defaulting to `orb`, so a practice of
your own and anything unrecognised keeps today's circle. The reduced-motion
alternative stays what it is: no shape animates when the system asks for less
motion.

### 16.3 Kapalabhati, behind a safety confirmation

Decision Q4. Rapid forceful exhales through the nose with passive inhales, in
rounds, with normal breathing between them.

**It does not fit the phase model**, and forcing it in would be wrong: 30 pumps
is 60 phases, past the 24-phase cap, and the app does not pace each pump
individually anyway — it sets a tempo and you follow. So two new phase kinds:

- `pump` — *n* breaths per second for *s* seconds. One phase, not sixty. The
  shape pulses at that rate and the count is shown.
- `rest` — breathe normally for *s* seconds. Like a hold, but the shape idles
  rather than freezing.

Kapalabhati is then `[pump, rest]`, three rounds. The two kinds are additive:
every existing pattern is untouched.

**Built gentler than this sketch said.** The numbers above were `pump 30 s at
1.5/s, rest 30 s`. What shipped is **20 pumps at one a second, then 40 seconds
of rest**, three rounds — three minutes in all. This is the one practice here
that can genuinely make someone faint, and the conservative version is a tempo
a beginner can actually hold with a rest long enough to notice how they feel
before the next round. Section 18 records it as built.

**The confirmation** is shown once, before the first Kapalabhati ever, and
remembered. It names who should not do it — pregnancy, high blood pressure,
heart conditions, epilepsy, glaucoma, recent surgery, a hernia, or on a full
stomach — and requires a deliberate tap. It is not a checkbox buried in
settings.

### 16.4 Breath foundations — seven days

A short course, one practice a day with a sentence about what it teaches. Day
one is the physiological sigh; day seven is whichever practice your own
check-ins rate best. Progress is a row per person (`user_journey_progress`:
journey, days completed, started on), and a day counts once you finish that
day's practice. Missing a day does not reset it — the whole point is to come
back.

### 16.5 Recorded voice clips — not in this phase, and why

Q3 agreed to "the phone's own voice now, with recorded clips later". Later is
not now, and the reason is plain: recorded clips need a recorded human voice,
and there is no way for me to produce one. Synthesising them would just be the
device voice again, hosted.

So this stays open, and it needs you: if you want it, the shortest path is you
recording about twenty short cues in English and Hindi ("Breathe in", "Hold",
"Breathe out", "Settle in", the counts), and I will build the loading, the
fallback and the preference around them. Until then the device voice stands,
and section 13's note about what Safari does and does not offer still applies.

## 17. Phase 3a — routines, as built

### 17.1 What changed for you

- **Four routines**, listed on the Breathe tab above the practices and filtered
  by the same chips: **Downshift** (after training), **Wind Down** (for sleep),
  **Morning**, and **Reset** (three minutes, mid-day).
- **A routine's page** shows what is in it, in order, with each step's length
  and every caution any step carries, said once. The only choices are how it
  sounds — the lengths belong to the routine.
- **It runs straight through.** A step ends, a hand-off names what is next and
  counts down six seconds, and the next step starts on its own. "Start now"
  skips the wait; "End here" stops, and what you have done is already saved.
- **The ending summarises the whole routine**, not its last step: total time,
  total breaths, the routine's name, and how many of its steps you did.
- **History shows it as one thing** — one entry named for the routine, opening
  onto the steps with their own times and breaths.

### 17.2 How it is put together

| Part | Where |
|---|---|
| Routine rows, step parsing, resolving against your timings | `src/lib/breathing/routine.ts` |
| Loading one | `src/app/breathe/load.ts` — `loadRoutine` |
| Its page | `src/app/breathe/routine/[slug]/{page,routine-setup}.tsx` |
| Running it | `src/app/breathe/routine/[slug]/session/page.tsx`, into the existing `BreathingSession` |
| The hand-off | `Handoff`, in `[slug]/session/breathing-session.tsx` |
| Harness | `/dev/breathe/routine/quick/session?speed=8` — two short steps, the whole sequence in seconds |

Migration `20260915090000_breathe_routines.sql`, applied 2026-09-12:

| Change | Purpose |
|---|---|
| `breathing_routines` (slug, name, `steps jsonb`, intents) | The catalogue, read-only from the client, like `breathing_patterns` |
| `breathing_logs` + `routine_id`, `routine_name`, `routine_step` | Which routine a log was part of, and where in it |
| `record_breathing_practice` + `p_session_id`, `p_routine_id`, `p_routine_step` | A later step appends to the session the first step opened |

Three decisions worth knowing:

1. **A step's length is stored as an intent** (`minutes` or `cycles`), not as a
   cycle count, and resolved against *your* phases. A practice you have retimed
   still runs for about as long as the routine says.
2. **Both check-ins go on the first step's log**, because "what works for you"
   pairs before and after on one row. Split across steps, every routine would
   silently vanish from it.
3. **A routine missing any of its practices is not offered at all** rather than
   offered short.

### 17.3 Verified

- **Unit tests:** 25 groups, all passing. The new ones cover step parsing (one
  step, seven steps, both units at once, neither, fractional cycles), resolving
  (order, caps, a missing practice, a practice of your own as a step, a retimed
  practice keeping its duration), the four seeded routines parsed straight out
  of the migration file, and the all-or-nothing rule for a routine step's save
  fields.
- **Against the live database, as you, rolled back — 18 checks:** three steps
  landing in one session; one session row; the duration being the steps added
  up; one log per step, each naming its routine, its place and its own
  practice; the check-in on the first step; a retried step returning the same
  session and writing nothing; a session from another day refused; an unknown
  routine refused; B1 still holding; a planned breathing slot still claimed;
  and a single practice still recording with no routine at all. A **second user
  was created inside the transaction**, so "someone else's session" was a real
  row: it was invisible, could not be written into, and its duration was
  untouched. Afterwards the database was checked: one user, no future sessions,
  no routine logs — the rollback took.
- **In the harness, end to end:** the two-step routine watched from the
  check-in through step one, its wind-down, the hand-off counting 6 → 1, step
  two starting with no settle-in, and the ending reading "0:40 · 4 breaths ·
  Quick Test · All 2 steps". The save payloads were read off the console: step
  one with no session, step two carrying the session step one opened. The
  rating went to step one's log. "Again" restarted from step one. "End here" at
  the hand-off gave "1 of 2 steps". With saving set to fail, the ending said
  "An earlier step of this routine could not be saved."
- **The real signed-in pages:** `/breathe` listing all four routines with their
  step names and lengths; `/breathe/routine/downshift` reading "5 breaths · 2
  min · 2 min, 4:46 of breathing in all"; `/breathe/routine/reset/session`
  opening on "Reset · step 1 of 2"; an unknown slug 404ing.
- **Production build** compiles with both new routes present.

**Two things this found.** A step written as "5 breaths" displayed as "45 sec",
because the label re-derived its unit from the practice's cap instead of
honouring the unit the step was written in. And ending part-way through the
last step still claimed "All 2 steps"; it now says "2 of 2".

**How the browser was driven, honestly.** The Browser pane was hidden for this
session, which makes the document hidden: `requestAnimationFrame` never fires
and the practice correctly auto-pauses. To watch the sequence at all I shimmed
`requestAnimationFrame` onto a timer and stubbed `document.hidden` in the page,
and clicked through scripted `.click()` calls rather than real pointer events.
So the component logic, the state machine and the payloads are proven; **the
motion itself, and real taps, are not.** That is on the phone checklist.

## 18. Phase 3c — Kapalabhati, as built

### 18.1 What changed for you

- **Kapalabhati is there**, eleventh in the list, marked Advanced, and the
  first practice behind the **Energy** chip — which until now had nothing.
- **It asks once, before it will open.** A screen of its own naming who should
  not do it, with "I have read this — continue" and "Not now". Answered once
  and remembered; it never asks again.
- **It is chosen in rounds**, not minutes and not breaths: 1, 2 or 3. Three
  rounds is three minutes.
- **A round pumps and then rests.** Twenty pumps at one a second, counted on
  screen as `12 / 20`, with a short knock on each. Then forty seconds of
  breathing normally: the orb holds still, because nothing is pacing you, and
  the ring around it fills until the next round.
- **Its timings cannot be edited**, unlike every other practice.

### 18.2 How it is put together

Two new phase kinds in `src/lib/breathing/engine.ts`:

| Kind | What it is |
|---|---|
| `pump` | *n* breaths a second for *s* seconds, as **one** phase. Twenty pumps as forty phases would pass the twenty-four a pattern may have — and the app does not pace each pump anyway, it sets a tempo you follow |
| `rest` | Breathing normally for *s* seconds. Not a hold: nothing is held, and the screen must not animate as though it were pacing you |

A pump is the only phase that does not simply travel from one size to another:
`positionAt` gives it an oscillation at its own rate, starting high and
snapping down, because the first movement of a pump is the forceful exhale.
`pumpAt` says which pump is happening, which is what the counter shows.

The knock per pump is `schedulePumps` in `audio.ts` — a dry 147 Hz tick, the
whole round scheduled in one call on the audio clock so the tempo never
drifts. It plays in **every** sound mode, including voice: the knocks are the
tempo, not decoration, and no voice can count at one a second. A rest is
silent on purpose.

Three places had to be told this practice is different:

1. **Length** is chosen in rounds (`lengthPlan`), with no custom option.
2. **The rhythm preview** samples the engine twice a pump, so the little orb on
   the card actually pumps instead of drifting.
3. **`resolveRoutine` refuses a routine containing it.** A routine runs
   straight through without asking, which is exactly what the confirmation
   exists to prevent. No seeded routine uses it; this is a guard, not a fix.

The confirmation is `user_settings.breathing_kapalabhati_ack` — a column, not a
table, because there is one practice that needs it and inventing a table would
be pretending otherwise. Migration `20260916090000_breathe_kapalabhati.sql`,
applied 2026-09-12.

**`pump` and `rest` stay ours.** `validatePatternDraft` still accepts only
inhale, hold and exhale, so a practice you build yourself cannot contain them,
and the timing editor is not offered for a practice that pumps.

### 18.3 Verified

- **Unit tests:** 28 groups, all passing. The new ones cover the round's shape
  (two phases, not forty; twenty breaths; a minute long), the oscillation
  (high at the top of each second, lowest half way through, back up a second
  later), the pump counter including its upper bound, the rest easing down
  without ever rising, rounds as the unit end to end, parsing (an absurd rate
  dropped, a rate on a non-pumping phase ignored, a rest alone still refused),
  the four-slot rule for your own practices, the acknowledgement as a boolean
  preference, the seeded phases read straight out of the migration file, and
  the routine guard.
- **Signed in, on the real account** — the first time a phase-3 screen has
  been: `/breathe` listing Kapalabhati as "3 rounds · Skull-shining breath ·
  Energy" with all four routines still resolving; `/breathe/kapalabhati`
  opening on the gate with no Start button; accepting it revealing the setup;
  **`breathing_kapalabhati_ack` confirmed `true` in the live database**; a
  reload no longer gated; and the session route opening on "Sharp out through
  the nose".
- **In the harness, a round watched end to end:** the counter stepping 1/20 to
  20/20, then "Breathe normally" counting 10 down to 1, then round two counting
  1/20 again; the ending recording `cycles: 2, breaths: 40, seconds: 30`. The
  orb's own transform was sampled while it ran: it swings between 0.55 and 0.71
  with 34 turning points, which is exactly `PUMP_LOW`–`PUMP_HIGH` through the
  painter. The rhythm preview's animation has 42 keyframes over 60 seconds, so
  it pumps rather than drifts.
- **Production build** compiles.

**Two wording fixes this found.** The setup screen read "60 breaths" beside
"3 rounds", and the ending read "40 breaths"; both now say pumps, the same word
the round itself uses.

**Still the hidden-pane caveat** from 17.3: the Browser pane was hidden, so
`requestAnimationFrame` was shimmed and clicks were scripted. The counter, the
sizes and the payloads are real; the motion at full speed and real taps are
yours to confirm.

## 19. Phase 3b — a signature shape per practice, as built

### 19.1 What changed for you

Until now every practice was the same circle, so the screen told you nothing
about which one you were doing. Each now has a shape that matches what it is:

| Shape | Practices | What it does |
|---|---|---|
| **Square** | Box Breathing | The ring traces **one side per phase**, so a full cycle draws the box |
| **Teardrop** | 4-7-8, Physiological Sigh | Round at the bottom, drawn to a point — the silhouette of a long exhale |
| **Lobes** | Nadi Shodhana, Anulom Vilom | Two lobes breathing together, the open nostril lit and the closed one dimmed |
| **Ripples** | Bhramari | Three rings spreading outward while you hum, still between breaths |
| **Pulse** | Kapalabhati | A ring flashing on every pump, dark through the rest |
| **Circle** | Coherent, Extended Exhale, Ujjayi, Sheetali, anything of yours | The smooth even ones, unchanged |

The cards carry the **silhouette** too, so you can tell practices apart in the
list before starting one.

### 19.2 How it is put together

`src/app/breathe/breath-shape.tsx` is one component with a `paint` handle.
Everything is driven by the two numbers the engine already returns — the eased
size and the progress through the phase — and written straight to the DOM from
the frame callback, never through React. It replaced the orb `div` and the ring
`svg` the session used to hold directly.

Two details worth keeping:

- **`pathLength={1}`.** The ring is normalised to a length of 1 whatever
  outline it has, so the painter writes a fraction and never has to know a
  circumference or measure a path. That is what lets a square ring and a circle
  ring share one line of code.
- **The square traces the cycle, not the phase.** `cycleProgress` is
  `(phaseIndex + progress) / phaseCount`, so it sweeps once per cycle and
  resets — and it still works if you switch a hold off and leave three phases.

The shape is **content**: a `shape` column on `breathing_patterns`, defaulting
to `orb`, so a practice seeded later can declare its own without the player
changing, and anything unrecognised falls back to the circle. Migration
`20260917090000_breathe_shapes.sql`, applied 2026-09-12. A practice of your own
is always a circle — it is whatever you made it, and a silhouette would claim
something about it that is not true.

At card size none of the real drawing reads, so `RhythmPreview` carries the
silhouette instead: a border radius per shape, a pair of lobes, a still ring
for the hum. The rhythm it was already animating does the rest.

### 19.3 Verified

- **Unit tests:** 29 groups. The new one checks the six shapes are accepted,
  that anything unknown, missing or of the wrong type falls back to the circle,
  that your own practice is a circle, and reads the assignments **straight out
  of the migration file** so the table above cannot drift from the database.
- **Every shape driven in the browser and measured, not eyeballed:**
  - **Square:** the ring swept `0.025 → 0.225 → 0.425 → 0.625 → 0.825` across
    the four phases and reset — one side per phase, over the whole cycle.
  - **Lobes:** sampled as a time series through a full Nadi Shodhana cycle.
    Left phases `L=1.00 R=0.24`, right phases `L=0.24 R=1.00`, holds
    `0.62/0.62` with neither favoured. (A first pass that recorded only the
    last value per cue looked inverted; that was the one-sample overlap where
    the painter has advanced and React has not re-rendered the words yet, not a
    bug.)
  - **Ripples:** three rings at staggered radii (83, 113, 142) with fading
    opacities during the hum, all at zero on the inhale.
  - **Pulse:** exactly 20 flashes in a 20-pump round, opacity 0 → 0.5, radius
    104 → 130, and completely dark through the rest.
  - **Silhouettes on the cards:** every one of the eleven practices measured —
    `24%` for the box, `50% 50% 50% 0` for both teardrops, two lobes for both
    alternate-nostril practices, a ring for Bhramari, `50%` for the rest.
- **Reduced motion**, forced by overriding the media query: the shape held
  `scale(0.84)` across all fifty samples and the breath came through opacity
  instead, 0.35 to 1.0. Ripples and the pump flash stay off.
- **Production build** compiles, and the now-unused `RING_R`/`RING_C` were
  removed from the theme.

**Still the hidden-pane caveat** from 17.3: the pane was hidden, so
`requestAnimationFrame` was shimmed and clicks were scripted. Every number
above is real; how the shapes *look* at full speed on a phone is yours.

---

## 20. Phase 3d — Breath foundations, as built

### 20.1 What changed for you

A course on the Breathe tab: **seven days, one practice a day, each with a
sentence saying what it teaches.** It sits above the routines, shows a mark per
day, and names the day that is open.

| Day | Practice | What it teaches |
|---|---|---|
| 1 | Physiological Sigh, 6 breaths | The fastest way down |
| 2 | Coherent Breathing, 3 min | A rhythm you can hold |
| 3 | Extended Exhale, 3 min | The exhale is the brake |
| 4 | Box Breathing, 3 min | Holding still is part of it |
| 5 | Anulom Vilom, 4 min | Attention needs somewhere to go |
| 6 | Bhramari, 4 min | A breath you can feel |
| 7 | **Chosen from your check-ins**, 5 min | The one that works on you |

The course page lists all seven, including the ones ahead — the reason to
follow a course rather than pick a practice is that someone decided the order
and can say why, and hiding what is coming would take that away. Only the open
day can be started. Its practice runs exactly as any other practice does: the
same player, the same sound, the same ending and check-in, with one line added
saying where the day leaves you.

**Two rules make it a course rather than a list.** Days go in order, and one
counts per calendar day. Miss a week and nothing resets — the next day is still
there. Finish a day and the next says "opens tomorrow", with a link back to the
practices, because the course ending for today is not a reason to stop
breathing.

**A day counts when you reach the end of it.** Ending part-way still saves the
practice to History; it just does not count the day, and the ending screen says
so rather than letting you find out tomorrow. Repeating a day is allowed and
counts nothing, which is what "Again" on the ending screen does.

### 20.2 How it is put together

**Schema** — `20260918090000_breathe_journey.sql`, entirely additive.

- `breathing_journeys` (slug, name, subtitle, description, about, `days jsonb`).
  A day is a routine step plus a title and a `teaches` sentence.
- `user_journey_progress` (user, journey, `days_completed`, `started_on`,
  `last_day_on`, `completed_at`), one row per person per course.
- `advance_journey_day(journey, day, local_date, log_id)`.

**The progress table has a read policy and no write policy at all.** Every
write goes through `advance_journey_day`, which is the only place the two rules
exist. This is the one function in the section that is `security definer`
rather than `security invoker`, and that is the reason: with no write path for
the client, the rules *are* the write path, and leaving them to the caller
would make them decoration. Everything it touches is scoped to `auth.uid()`.

- It counts a day only against a `breathing_logs` row that exists **and is
  yours**, so a day cannot be counted against nothing, or against somebody
  else's practice.
- Being refused is not an error. Repeating a day is an ordinary thing to do, so
  the function returns where you are and whether it moved, and the screen says
  which.

**Day seven** is `{"pick": "best", …}`, resolved at load by `bestRated` against
the same check-ins that feed "What works for you". Highest average afterwards
wins, ties go to the practice done more often. A gated practice is never
chosen, however well it rates — a course must not walk anyone past Kapalabhati's
confirmation. A routine's name matches no practice and drops out on its own.
With too few check-ins the day falls back to the practice named in the course
and says plainly that it is a fallback, so a brand new course still resolves.

**Where the day is counted** — `BreathingSession` wraps the save action for a
journey exactly as it wraps it for a routine: the practice saves first, and
only a successful, not-ended-early save counts the day. So the retry on a
failed save counts the day too, and nothing new had to be threaded through the
player.

**Routes** — `/breathe/journey/<slug>` and `/breathe/journey/<slug>/session`,
mirroring the routines. **Which day may run is decided on the server, not taken
from the URL**: a day that is done can be run again (a reload straight after
finishing one lands there), but a day still ahead redirects back to the course.

### 20.3 Verified

**The two rules, as the real user against the live database, rolled back.**
Eleven checks, all passing: day one counts; repeating it counts nothing; day
two is refused on the same date and accepted the next; day six cannot be jumped
to; an invented practice id is refused; only your own progress row is visible;
the table cannot be written or inserted into directly (RLS refuses); the
seventh day stamps `completed_at`; and there is no eighth day. A twelfth check,
in its own transaction, confirms **a stranger's practice cannot count your
day** and creates no progress row when it tries.

**Logic** — three new test groups (30, 31, 32) in `scripts/test-breathing.ts`,
which now runs 32 groups. They cover day parsing and its refusals, day states,
labels in the unit the day was written in, the one-a-day and finished cases,
`bestRated`'s ordering and its two exclusions, and the fallback. Group 32 reads
**the seeded course out of the migration** and checks every day against the
slugs in the pattern migrations, so the course cannot name a practice that does
not exist.

**In the browser** — every screen state driven and read: the course not
started, three days in, already counted today, and finished; the card on the
Breathe tab in each of those, with its day marks checked mark by mark; day
seven resolving to the best-rated practice and falling back with no check-ins;
the nav allowlist across ten routes. A day was then run end to end four times —
finished (`Day 4 of 7 · 3 to go`), repeated (`already counted today`), ended
part-way (`Day 4 counts when you reach the end of it`, with the practice still
saved), and with the save failing then retried, where the day correctly counts
only once the retry lands.

**Two latent bugs found and fixed on the way**, both from phase 3a:

- The tab bar was missing from the routine setup page. The nav allowlist
  matched one path segment after `/breathe`, and routines live two deep.
- A routine's practice screen loaded the Breathe tab's bright skeleton instead
  of the dark room, because `loading.tsx` only existed under `[slug]/session`.

**Still the hidden-pane caveat** from 17.3: the pane was hidden, so
`requestAnimationFrame` was shimmed and the clicks were scripted.

**What is not covered.** There is no way to restart a finished course. It felt
worse to invent a reset nobody has asked for than to leave the course finished
and the practices where they are; if you want one, it is a small addition.

---

## 21. The whole section, on production (2026-09-12)

Everything above was verified against localhost and the live database. This is
the section checked on **abhyas-indol.vercel.app**, signed in as you, on
deployment `55d202e`.

### 21.1 What was checked, and what it showed

| Screen | Result |
|---|---|
| Breathe tab | Week strip, Again, "For right now" (correctly picking 4-7-8 late in the evening), all six intent chips, the Course card, all four routines, all eleven practices, Create your own |
| Intent filter | Filtering by Sleep leaves Wind Down alone and **hides the course**, as designed |
| Course | Seven days, day one open, the rest dimmed, each with its own practice's silhouette |
| `?day=5` | **Redirected back to the course.** A day still ahead cannot be jumped to by URL, and the decision is made on the server |
| Kapalabhati | **The gate is intact and waiting for you** — the safety note, "I have read this — continue" and "Not now", no Start. It was not accepted from here |
| Routine (Wind Down) | Three steps at the right lengths, both cautions shown once, 6:16 total, "Why in this order" |
| Practice (Box Breathing) | Phases, level, intents, benefit, caution, how-to, lengths, guidance, the timings editor, "Why it works" |
| History | The four breathing sessions with names, durations and breath counts |
| Tab bar | Present on every setup page including the two nested ones, absent on every `/session` route |

**The shapes, seen rather than measured.** Section 19 could only measure them,
because the pane was hidden. On production, in a browser I could actually look
at, all eleven silhouettes render and are distinguishable: the rounded square
for the box, teardrops for 4-7-8 and the sigh, paired lobes for both
alternate-nostril practices, the ringed circle for Bhramari, circles for the
smooth ones.

**And each card breathes its own rhythm.** Read off the live page as WAAPI
keyframes: box 16s in 5 frames with the holds visible as repeated values,
4-7-8 19s, coherent 11s, the sigh 9s with the two-part inhale at 0.884, Nadi
Shodhana 32s over seven frames, Anulom Vilom 16s — and **Kapalabhati 42
keyframes across 60 seconds**, which is twenty pumps sampled twice each, so the
card really pumps rather than drifting.

### 21.2 Three things found, all fixed

1. **A real error on the first request after the deploy.** The Breathe tab
   showed "This page couldn't load". The Vercel runtime log named it:
   `Could not load the breathing practices: JWT issued at future`. It is clock
   skew between Supabase's token and the function's host, not a regression —
   and it did not recur in eighteen further requests. But it is worth knowing
   that **any transient error loading the pattern list takes the whole tab
   down**, because `/breathe/page.tsx` throws on `patternsRes.error`. It
   recovers on reload and the error screen offers one. Left as it is, but
   written down here rather than dismissed.
2. **Four literal `--` in the seeded course text**, where every other piece of
   seeded content in the app uses a real em dash. Only visible by reading the
   live page. Fixed by `20260918100000_breathe_journey_dashes.sql` — a
   correction rather than an edit, because the original insert ends in
   `on conflict do nothing` and would not have touched the existing row. The
   source migration is fixed too, so a fresh database never has it.
3. **"1 breaths" in History.** A missing plural guard in `SessionRow`,
   pre-existing since phase 1 and visible on two of your own sessions. Fixed.

### 21.3 The one thing deliberately not done

**No practice was started on your account.** Running one would put a session in
your history for today, and running day one of the course would consume it and
close day two until tomorrow — which is exactly the thing checklist items 36
and 37 are there for you to see. The player itself is verified end to end in
the harness (four full runs, §20.3); what is unverified on production is the
saving of a practice that you start, and that is one tap away whenever you want
it.

## Change log

- **2026-09-11** — Draft: review of the current section (7 bugs, 13 experience
  findings) and the proposed redesign. Nothing built.
- **2026-09-12** — All decisions agreed. Phase 1 built:
  - migration `20260912090000_breathe_phase_one` applied
  - the timeline engine, clock, sound, stats and validation libraries
  - the Breathe tab, home, setup and full-screen practice
  - the History and Settings changes
  - the dev harness and sound lab

  Verified with unit tests, the database function run as your user (rolled
  back), the live API, the browser harness and a production build. Fixed during
  testing: overlap on short screens, the iOS detection false positive, and a
  wrong code comment. `PERF-SPEC.md`'s pattern count corrected.
- **2026-09-12, later** — Phase 2a (sound), on `breathe/sound`: Ocean, the four
  beds with their own volume, voice in English and Hindi, and Bhramari's hum.
  Migration `20260913090000_breathe_sound` applied. Section 14 has the detail.
  Fixed during testing: a pitch measurement that reported half the true pitch,
  a hydration failure in the lab, and a missing field on the "Again" card.
- **2026-09-12, later still** — Phase 2b, completing phase 2: your own timings,
  your own practices, the "for right now" suggestion, what works for you, and
  four more practices. Migration `20260914090000_breathe_your_own` applied.
  Section 15 has the detail. Fixed during testing: the editor put a saved
  practice's phases in the wrong slots.
- **2026-09-12** — You practised on localhost while signed in, and the app
  recorded it correctly. The "nothing has been run signed in" gap in section 13
  is closed for phase 1 and 2a.
- **2026-09-12** — `main` pushed to GitHub (`d26d898`), which is the first time
  any of the Breathe work has left this machine.
- **2026-09-12, phase 3** — Designed in section 16, with recorded voice clips
  deliberately excluded and the reason written down (16.5). **3a, routines,
  built** on branch `breathe/routines`: four seeded routines, the hand-off
  between steps, one session with a log per step, and the History and
  home-screen changes that follow. Migration `20260915090000_breathe_routines`
  applied. Section 17 has the detail. Fixed during testing: a step written in
  breaths displayed in seconds, and an ending that claimed "All 2 steps" after
  being cut short.
- **2026-09-12** — Phase 3a merged to `main` and pushed (`f77a64d`).
- **2026-09-12, phase 3c** — **Kapalabhati built**, on branch
  `breathe/kapalabhati`: two new phase kinds (`pump` and `rest`), a length
  chosen in rounds, a knock on every pump, and the one-time safety confirmation
  agreed as decision Q4. Seeded gentler than section 16.3 sketched — twenty
  pumps at one a second with a forty-second rest — and 16.3 now says why.
  Migration `20260916090000_breathe_kapalabhati` applied. Section 18 has the
  detail. **The gate was accepted on the real signed-in account and the
  acknowledgement confirmed in the live database**, which is the first phase-3
  screen exercised signed in. Fixed during testing: two screens counting pumps
  as "breaths".
- **2026-09-12** — Phase 3c merged to `main` and pushed (`9d4ebed`).
- **2026-09-12, phase 3b** — **A signature shape per practice built**, on
  branch `breathe/shapes`: a square traced one side per phase, teardrops, lobes
  that light the open nostril, ripples for the hum, a flash per pump, and the
  circle for the smooth ones. A `shape` column makes it content rather than
  code. The cards carry the silhouette too. Migration
  `20260917090000_breathe_shapes` applied. Section 19 has the detail, including
  every shape measured in the browser rather than eyeballed.
- **2026-09-12** — Phase 3b merged to `main` and pushed (`9817818`).
- **2026-09-12, phase 3d** — **Breath foundations built**, on branch
  `breathe/journey`, **completing phase 3**: a seven-day course, one practice a
  day with a sentence on what it teaches, in order and one a day, with the last
  day chosen from your own check-ins. Migration
  `20260918090000_breathe_journey` applied. Section 20 has the detail. The two
  course rules were tested as the real user against the live database and
  rolled back — twelve checks, including that a stranger's practice cannot
  count your day and that the progress table refuses every direct write. Found
  and fixed on the way: two latent phase-3a bugs (the tab bar missing from the
  routine setup page, and a routine's practice screen loading the bright tab
  skeleton instead of the dark room), and the dev fixture missing four
  practices, which had been silently hiding two of the four routines from the
  harness.
- **2026-09-12** — Phase 3d merged to `main` and pushed (`55d202e`), and
  **the whole section checked on production** signed in as you. Section 21
  records it. Three things found and fixed: four literal `--` in the seeded
  course text (migration `20260918100000_breathe_journey_dashes`), "1 breaths"
  in History, and a transient `JWT issued at future` that takes the whole
  Breathe tab down when the pattern query fails — that one is written down
  rather than fixed. The shapes were seen rather than only measured for the
  first time, and every card's rhythm was read off the live page. No practice
  was started on your account, and the Kapalabhati gate is still waiting for
  you.
