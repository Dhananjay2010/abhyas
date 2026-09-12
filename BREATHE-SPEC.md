# BREATHE-SPEC.md — the Breathe tab

**Status:** Phase 1 (the tab and the practice), phase 2a (sound) and phase 2b
(your own timings, your own practices, the suggestion, what works for you, and
four more practices) are built and verified. **Phase 2 is complete**; only
phase 3 remains. The sound modes and the phase 2b screens still want a look on
a real phone (section 13).
**Branches:** `feature/breathe-tab` off `main`, then `breathe/sound` stacked on
it, because phase 1 is not merged yet. To review the sound work on its own,
diff `breathe/sound` against `feature/breathe-tab`.
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
- **Phase 3:**
  - Routines
  - Kapalabhati behind a safety confirmation
  - A signature shape per pattern
  - Recorded voice clips
  - A seven-day "Breath foundations" journey

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
  timings, your own practices), and every sound mode but tones. Those rest on
  the harness, on the database function run as your user in SQL, and on the
  queries checked against the live API.

- **Chrome could not be driven from here** (no browser was connected), so the
  signed-in checks are yours to run rather than mine.
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
