# Abhyas — Fitness Tracking App

> **Abhyas** (अभ्यास) — *practice; repetition*. One word covering weights, yoga and meditation.
> Working name. Easy to change — it appears only in branding constants.

**Status:** Foundation built — schema live, auth wired, deployed.
**Last updated:** 2026-09-08

| | |
|---|---|
| Repo | https://github.com/Dhananjay2010/abhyas (private) |
| Live | https://abhyas-indol.vercel.app |
| Supabase ref | `bjtjhnfyheruxldqbmrj` |
| Node | 20.19.6 (`.nvmrc`) — run `npm run dev:nvm`, not `npm run dev` |

---

## 1. What we are building

A mobile-first web app that tells you exactly what to do for your workout every single day, guides you through it with timers, and records what you did so it can make next week harder than this week.

The defining constraint: **a session is one hour**, structured as warm-up → work → cool-down. The app is a coach, not a spreadsheet.

Multi-user, public signup, per-user data stored day-wise.

### Non-goals for v1
- Social features, sharing, leaderboards
- Nutrition or calorie tracking
- Wearable / HealthKit / Google Fit integration
- Native mobile app (PWA only — see §16)
- Paid tiers or payments

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 | Same as `pahadi-adda`, known quantity |
| Language | TypeScript (strict) | |
| Styling | Tailwind CSS 4 | |
| Database | Supabase Postgres (free tier) | |
| Auth | Supabase Auth — **Google OAuth only in v1** | |
| Hosting | Vercel | Already linked |
| Source control | Git → GitHub | Enables Vercel auto-deploy |

**Free-tier limits to remember:** Supabase free projects pause after ~7 days of no activity and cap at 500 MB. Fine for early users; needs a paid plan before any real launch.

---

## 3. Core vocabulary

| Term | Meaning |
|---|---|
| **Track** | The kind of training: `weights`, `bodyweight`, `yoga`, `meditation` |
| **Block** | A 4-week training cycle. Weeks 1–3 progress, week 4 deloads. Then exercises rotate. |
| **Program** | The generated weekly template for a block — which day is which |
| **Session** | One day's actual workout, planned or performed |
| **Set** | One logged set: reps + weight |
| **Working weight** | The weight currently being used for an exercise, per user |

---

## 4. Personalisation inputs, and what each actually does

Collected at onboarding. **Be honest about weighting** — goal, equipment and injuries do most of the work.

| Input | How it's used |
|---|---|
| **Goal** | Sets rep ranges and rest times. The single strongest signal. |
| **Level** | Sets exercise complexity, volume, and progression speed |
| **Equipment** | Hard filter — an exercise is never shown if you can't do it |
| **Injuries** | Hard filter on contraindicated exercises **and** adds targeted warm-up/prehab |
| **Days per week** | Picks the split (3 → full body, 4 → upper/lower, 5–6 → PPL) |
| **Age** | Safety filter. ≥50 caps high spinal-load lifts by default; extends warm-up |
| **Height + weight (BMI)** | Safety filter. BMI ≥30 excludes high-impact/plyometric work |
| **Sex** | Recorded, but changes almost nothing in exercise selection. Used only for BMR-style estimates later. |

### Goal → prescription

| Goal | Reps | Rest | Emphasis |
|---|---|---|---|
| Strength | 3–6 | 180s | Heavy compounds, low volume |
| Muscle gain | 8–12 | 90s | Compounds + isolation |
| Fat loss | 12–15 | 45–60s | Circuits, supersets, density |
| General fitness | 8–12 | 75s | Balanced |
| Flexibility & stress | — | — | Yoga/mobility dominant |

---

## 5. Onboarding flow

1. **Google sign-in**
2. **Medical disclaimer** — must be explicitly accepted, timestamp stored. Minimum age **16**.
3. **About you** — date of birth (not age, so it stays correct), sex, height (cm), weight (kg)
4. **Goal** — one of the five above
5. **Level** — beginner / intermediate / expert, with plain-language descriptions of each
6. **Track preference** — Gym (weights) or Home (bodyweight / yoga / meditation)
7. **Days per week** — 3 to 6
8. **Mix** — optionally allocate some of those days to yoga (e.g. 4 gym + 1 yoga)
9. **Equipment checklist** — with a prominent **"I have access to everything"** skip button
10. **Injuries** — body regions, current vs past, optional note. Skippable.
11. → First block generated, land on Today

---

## 6. Program generation engine

Deterministic rule engine. **No LLM calls.** Repeatable, free, testable.

### Splits by frequency
| Days/week | Split |
|---|---|
| 3 | Full Body A / B / C |
| 4 | Upper / Lower / Upper / Lower |
| 5 | Push / Pull / Legs / Upper / Lower |
| 6 | Push / Pull / Legs ×2 |

Yoga days **count as training days** and are placed to avoid sitting next to the heaviest leg day. Rest days are suggested by the engine but the user can always override (see §8).

### Exercise selection per day
1. Filter the catalogue by track, available equipment, and level
2. Remove anything contraindicated by injuries, BMI or age
3. Fill slots by movement pattern (e.g. Push day = horizontal press, vertical press, triceps, lateral delt)
4. Order compound → isolation
5. Apply goal's sets/reps/rest

### Blocks
- A block is **4 weeks**. Weeks 1–3 progress. **Week 4 is a deload** — ~60% volume, ~70% intensity, nothing to failure.
- At block end, main compound lifts **carry over** (that's where progress lives); roughly 30–40% of accessories rotate for variety.
- Block number increments; history is never discarded.

### Progression — double progression
- Stay at a weight until you hit the **top of the rep range on every set**, then add the smallest sensible increment.
- Increments: isolation +1.25 kg · upper compound +2.5 kg · lower compound +5 kg
- Bodyweight: add reps first, then progress to a harder variation of the same movement.
- **Feel check:** after the last set of each exercise, one tap — *easy / right / hard*. "Easy" can accelerate the jump; "hard" holds it.
- **Stall rule:** miss the target twice in a row → automatically drop ~10% and build back.

### Planning mode (user setting)
- `progression` (default) — everything above
- `daily_menu` — no working-weight memory, no auto-progression; a fresh sensible session each day
- Switchable in Settings at any time. **Switching does not delete history**; returning to `progression` resumes from the last known working weights.

---

## 7. Session structure

Default 60 minutes:

| Block | Time | Contents |
|---|---|---|
| **Warm-up** | 15 min | 5 min light cardio · 5 min dynamic mobility for today's muscles **and any injured regions** · 5 min ramp-up sets on the first lift |
| **Work** | 40 min | The exercises. **Rest between sets counts inside this block.** |
| **Cool-down** | 5 min | Static stretches for what was trained. Toggleable in Settings. |

Duration presets per track: weights 45/60/75 · bodyweight 30/45/60 · yoga 30/45/60 · meditation 5/10/20/30 (user-set).

### Guided session flow
Screen-by-screen, timer-driven. One exercise on screen at a time — big text, thumb-reachable buttons, readable at arm's length in a gym.

- Rest timer **auto-starts** when a set is logged; sound + vibration on completion
- **Swap button** on every exercise → 2–3 alternatives hitting the same muscles with your available equipment (machine busy, or something hurts)
- **Screen wake-lock** held for the whole session
- **Resume** — if the phone locks or the app is closed mid-session, offer to pick up exactly where you left off. Controlled by a setting (`resume_session`), since not everyone wants it.
- **Per-set logging** is a setting. On (default) = reps + weight per set. Off = tick the exercise as done.

### End of session
- Summary: duration, total volume, PRs hit
- **"What about tomorrow?"** prompt: *keep the plan · swap the day · rest*. This is what makes the plan feel like yours.
- If a day is missed, the same prompt appears on next open.

---

## 8. Rest days

The engine schedules them, the user overrides them. A rest day still shows options: full rest, active recovery (mobility flow), yoga, or meditation. Nothing is forced.

---

## 9. Track detail

### 9.1 Weights (gym)
The full progression engine. Barbell/dumbbell/machine/cable, filtered by the equipment checklist.

### 9.2 Bodyweight (home)
Same engine, but progression is **variation-based** rather than load-based — knee push-up → push-up → decline → archer, and so on. Each exercise carries an ordered progression chain.

### 9.3 Yoga — Yoga with Adriene
- **Hardcoded, hand-picked playlists.** No YouTube Data API in v1 — more reliable, and we control ordering.
- Videos are **embedded, never downloaded or re-hosted**. That is the legally clean path.
- Graceful fallback: if a video is removed or has embedding disabled, show an "Open on YouTube" link rather than a dead frame.
- Clear attribution and a link to her channel on every yoga screen.
- **Completion is self-reported** — we can't detect watching.
- Progress through a series is tracked (which day of a 30-day series you're on).
- *If this ever gets real traction, send her channel a courtesy note. Not legally required for embeds, just decent.*

### 9.4 Meditation — breathing only, for v1
Not guided-audio meditation. **Breathing exercises with a visual pacer and timer**, aimed at calming down.

Seeded patterns:
| Pattern | Cycle (in–hold–out–hold) | For |
|---|---|---|
| Box breathing | 4–4–4–4 | Focus, pre-workout calm |
| 4-7-8 | 4–7–8–0 | Falling asleep |
| Coherent breathing | 5.5–0–5.5–0 | Baseline calm |
| Physiological sigh | double inhale–0–long exhale–0 | Fast stress relief |
| Nadi Shodhana | alternate nostril | Balance |
| Bhramari | humming exhale | Anxiety |

All timings and cycle counts are **user-adjustable in Settings**. Animated expanding-circle pacer, optional haptics on phase change.

---

## 10. Exercise database & media

### Text data
Seed from **free-exercise-db** JSON (names, muscles, equipment, mechanic), then hand-curate. Instructions rewritten in our own words.

### Media — v1: photos + YouTube embeds
- **wger** images where coverage exists — CC-BY-SA, free, attribution rendered on screen
- **YouTube embeds** for demonstration video on every exercise
- **Not shipping free-exercise-db images.** The repo's Unlicense covers the JSON, not the photos — their provenance traces to a scrape of a commercial site, and three GitHub issues asking whether they're safe for commercial use are unanswered. Fine privately; not for a public app.

### Media — v2: GIFs
Buy **ExerciseDB**'s one-time perpetual licence (~1,394 exercises, clean GIFs, commercial use permitted, no redistribution).

### The design decision that makes this cheap
Media lives in a **separate `exercise_media` table** keyed to the exercise, carrying `type`, `url`, `attribution` and `licence`. Swapping wger → ExerciseDB later is a data migration, not a rewrite. **Never hardcode a media URL into a component.**

---

## 11. Safety

- **Disclaimer** accepted at signup, timestamped. "Not medical advice" in the footer.
- Minimum age 16.
- BMI ≥ 30 → exclude `impact = high` (jumping, plyometrics, burpees); prefer supported/machine variants
- Age ≥ 50 → exclude `spinal_load = high` by default (barbell back squat, conventional deadlift) in favour of goblet squat / trap bar / leg press; longer warm-up
- Injuries → exclude exercises whose `contraindicated_regions` overlap, and inject prehab into the warm-up
- Any filter can be overridden by the user in Settings, with a warning shown once

---

## 12. Database schema (Supabase Postgres)

### User tables — all RLS-protected, `auth.uid() = user_id`

**`profiles`** — `id` (FK auth.users), display_name, date_of_birth, sex, height_cm, level, goal, units, timezone (default `Asia/Kolkata`), days_per_week, yoga_days_per_week, preferred_session_minutes, has_all_equipment, onboarding_completed_at, disclaimer_accepted_at

**`user_settings`** — user_id, planning_mode (`progression`|`daily_menu`), per_set_logging, resume_session, cooldown_enabled, rest_timer_sound, rest_timer_vibrate, rest_timer_autostart, rest_seconds_override, bodyweight_prompt (`weekly` default), meditation_default_minutes, theme (`dark` default), safety_overrides jsonb

**`user_equipment`** — user_id, equipment_id, available

**`user_injuries`** — user_id, body_region, severity (`current`|`past`), note

**`programs`** — user_id, block_number, split_type, days_per_week, started_on, ends_on, deload_week (default 4), status

**`program_days`** — program_id, day_index (1–7), day_type (`weights`|`bodyweight`|`yoga`|`meditation`|`rest`|`active_recovery`), focus, label

**`program_day_exercises`** — program_day_id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds

**`sessions`** — user_id, program_id, program_day_id, **`local_date`** (the day-wise key, computed in the user's timezone), planned_type, actual_type, status (`planned`|`in_progress`|`completed`|`skipped`|`rest`), started_at, completed_at, duration_seconds, warmup_completed, cooldown_completed, energy_rating, notes

**`session_exercises`** — session_id, exercise_id, order_index, planned sets/reps, status, swapped_from_exercise_id, feel (`easy`|`right`|`hard`)

**`session_sets`** — session_exercise_id, set_number, reps, weight_kg, is_warmup_set, completed_at

**`exercise_progress`** — user_id, exercise_id, current_working_weight_kg, current_target_reps, consecutive_failures, last_performed_on, best_weight_kg, best_e1rm. *This table is the heart of the progression engine — a materialised view of where you are on each lift.*

**`body_metrics`** — user_id, recorded_on, weight_kg, body_fat_pct, unique(user_id, recorded_on)

**`user_yoga_progress`** — user_id, playlist_id, completed_video_ids, last_completed_at

### Reference tables — public read, no user write

**`equipment`** — slug, name, category
**`exercises`** — slug, name, aliases, tracks, category, mechanic, force, primary_muscles, secondary_muscles, equipment_ids, level_min, instructions, contraindicated_regions, impact, spinal_load, default_rest_seconds, progression_chain_id, progression_rank, source, source_licence
**`exercise_media`** — exercise_id, type (`photo`|`gif`|`video_youtube`), url / youtube_id, position, attribution, licence
**`exercise_substitutions`** — exercise_id, substitute_exercise_id, rank *(manual overrides; the default substitution list is computed from matching muscles + available equipment)*
**`warmup_exercises`** — slug, name, target_regions, type (`cardio`|`mobility`|`prehab`), duration_seconds, media
**`breathing_patterns`** — slug, name, inhale_s, hold_in_s, exhale_s, hold_out_s, default_cycles, benefit, contraindications
**`yoga_playlists`** — title, youtube_playlist_id, creator, level, description
**`yoga_videos`** — playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas

### Security
- RLS **enabled on every user table**, no exceptions. This is health data.
- Reference tables: `select` for `authenticated`, no insert/update/delete.
- Service-role key **never** reaches the client.
- Streaks computed on read, not stored.

---

## 13. Settings screen (complete list)

| Setting | Default |
|---|---|
| Planning mode — progression / daily menu | progression |
| Per-set logging | on |
| Resume interrupted session | on |
| Cool-down block | on |
| Rest timer: auto-start / sound / vibration | all on |
| Rest duration override | goal default |
| Session length | 60 min |
| Body-weight prompt — daily / weekly / never | weekly |
| Meditation default duration + per-pattern timings | 10 min |
| Equipment | from onboarding |
| Injuries | from onboarding |
| Goal / level / days per week | from onboarding |
| Units | kg / cm |
| Theme | **dark** |
| Safety filter overrides | off |

Changing goal, level, days/week or equipment **regenerates the current block** (with a confirmation), preserving all history.

---

## 14. Design direction

- **Dark by default.** Gym lighting, evening use.
- Mobile-first, ~390px design target; desktop is a centred column.
- Large type and large tap targets — readable and hittable mid-set with sweaty hands.
- Bottom navigation: **Today · History · Progress · Settings**
- Minimal chrome during a session. One job per screen.

---

## 15. Testing & deployment

- Git repo → GitHub → Vercel auto-deploy. Every push produces a preview URL.
- **Real-device testing is mandatory, not optional.** Timers, wake-lock, vibration, PWA install and audio autoplay all behave differently on real iOS Safari than in any desktop preview. Nothing gets called "working" on the strength of a desktop check.
- Supabase: separate projects for dev and production once real users exist.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never commit `.env`.

---

## 16. Roadmap

### v1 — the thing you'd actually use daily
Google auth · onboarding · block generation · Today screen · guided session with timers, wake-lock and swap · per-set logging · rest days · breathing exercises · Yoga with Adriene playlists · history · weekly body-weight log · settings · dark mobile-first UI

### v1.1
PWA install + offline shell · progress charts (volume, e1RM, body weight) · streaks · push reminders · email + magic-link auth *(needs a domain and an SMTP provider such as Resend)*

### v2
GIF media upgrade (ExerciseDB licence) · exercise search & manual session building · custom programs · CSV export · guided-audio meditation

### Later
Native app in **React Native** — the entire Supabase backend, schema and rule engine are reusable; only the UI is rebuilt. Explicitly **not** wrapping this Next.js app in Capacitor.

---

## 17. Assumptions I made — correct me if any are wrong

1. **Mixed weeks allowed.** A gym user can have yoga days in the same week (e.g. 4 weights + 1 yoga + 2 rest). Since yoga counts as a training day, this seemed clearly right.
2. **Cool-down included** — 15 warm-up / 40 work / 5 cool-down inside the hour, toggleable. Your original framing was 15 + 45.
3. **Rest between sets counts inside the work block**, not on top of it. It's roughly 40% of a real session, so excluding it would blow the hour.
4. **Deload is week 4 of each 4-week block**, rather than a separate fifth week.
5. **Minimum signup age 16**, given public signup and health data.
6. **Date of birth, not age**, so the profile doesn't silently go stale.
7. **One session per calendar day** is the normal case, but the schema permits more.
