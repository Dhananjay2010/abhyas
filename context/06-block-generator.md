# 06 — Block generator

## What this delivers

Given a user's profile, the deterministic rule engine that produces a four-week
training block: which day is which, and exactly which exercises with what sets,
reps and rest.

No LLM is involved. It is repeatable, free and testable.

## Files

| File | Role |
|---|---|
| `src/lib/program/generate.ts` | The engine — a pure function |
| `src/lib/program/splits.ts` | Splits, day templates, yoga placement |
| `src/lib/program/prescription.ts` | Goal → sets, reps, rest; deload |
| `src/lib/program/persist.ts` | Loads inputs, calls the engine, writes to the database |
| `src/app/today/actions.ts` | `buildPlan()` server action |
| `scripts/test-generator.ts` | 30 checks against a fixture of the real catalogue |

`generateProgram(input) → GeneratedProgram` is pure: catalogue in, plan out, no
I/O. That is what makes it testable without a session.

## Splits

| Training days | Split | Days |
|---|---|---|
| 3 | `full_body` | Full Body A / B / C |
| 4 | `upper_lower` | Upper / Lower / Upper / Lower |
| 5 | `ppl` | Push / Pull / Legs / Upper / Lower |
| 6 | `ppl` | Push / Pull / Legs ×2 |

Each day is a list of **movement-pattern slots**, compounds first. A Push day
asks for horizontal press, vertical press, a second horizontal press, lateral
delt, triceps — and the engine fills each slot from the catalogue.

Weekday placement comes from `activeDayIndices()`; unused days become rest.

## Prescription

From `SPEC.md` section 4:

| Goal | Sets | Reps | Rest |
|---|---|---|---|
| Strength | 4 | 3–6 | 180s |
| Muscle gain | 4 | 8–12 | 90s |
| Fat loss | 3 | 12–15 | 50s |
| General fitness | 3 | 8–12 | 75s |
| Flexibility & stress | 2 | 12–15 | 60s |

Beginners get one set fewer. Isolation work gets one set fewer, at least 8–12
reps and at most 75s rest — strength rep ranges make no sense on a lateral
raise. Week 4 of each block is a deload at ~60% of the set count.

## Safety filters

All applied in `isEligible()`, all hard:

| Filter | Rule |
|---|---|
| Track | A bodyweight user never sees gym-only work |
| Level | Nothing above the user's stated experience |
| Equipment | Every required item must be in the user's set |
| Current injuries | Nothing loading an affected joint |
| BMI ≥ 30 | No `impact = high` |
| Age ≥ 50 | No `spinal_load = high` |

### Judgment call: current vs past injuries

`SPEC.md` says injuries are a hard filter without distinguishing severity. Only
**current** injuries hard-filter here. Past ones will drive prehab in the
warm-up instead — permanently banning squats for a knee that hurt two years ago
seemed wrong. **This is a deliberate deviation from the spec and is open to
being overruled.**

## Determinism and variety

Selection is seeded with `mulberry32(hash(userId + ":" + blockNumber))`, so the
same inputs always yield the same block, while a new block number reshuffles
the choices. Measured carry-over from block 1 to block 2 is about 45%, which
matches the spec's intent that main lifts persist and accessories rotate.

Within a slot, candidates are scored: compound preferred for the first two
slots, isolation after; a small bonus for matching the user's level; a penalty
per extra piece of equipment, preferring the simplest setup that does the job.
Ties break on the seeded value, then on slug for stability.

## Pattern fallback

If a slot has no eligible candidate — a home user with no pull-up bar has no
vertical pull — `PATTERN_FALLBACK` substitutes the nearest useful pattern
(vertical pull → horizontal pull, hinge → squat, and so on). If the fallback is
also empty, the slot is dropped rather than failing the whole plan.

## Persistence

`createBlockForUser()` gathers the profile, latest weight, equipment, injuries
and the full catalogue in one parallel round trip, generates the plan, then:

1. Marks any existing active program `completed` (a partial unique index allows
   only one active program per user).
2. Inserts `programs`, then `program_days`, then `program_day_exercises`.

`user_id` is passed on child rows but is overwritten by the definer trigger
with the true owner — see step 02.

If no training day ends up with any exercises, it returns an error telling the
user to widen their equipment list rather than writing an empty plan.

## Verification performed

`npm run test:generator` — 30 checks against a catalogue exported from the live
database. All pass:

- Correct day counts, split type, no exercise repeating within a block
- **Knee injury** removes every knee-loading exercise
- **Age 55** removes all high spinal load
- **BMI 32** removes all high impact
- **Bodyweight, zero equipment** still yields 9 exercises, none needing kit
- **Beginner** never receives an advanced movement
- **Dumbbells + bench only** yields 22 exercises, none outside that list
- Yoga days placed, never adjacent to a leg day
- Same input → identical plan; block 2 differs from block 1
- **Combined:** 52 years old, BMI 31, shoulder *and* lower-back injuries →
  still a coherent 22-exercise plan violating none of the filters

Database writes verified separately under RLS (step 02).

## Bug: yoga and breathing tracks were given a strength split

Found on first real use, 2026-09-09.

A user who chose **yoga** in onboarding was handed a six-day push/pull/legs
weights split. `generateProgram` only special-cased `bodyweight`; `yoga` and
`meditation` fell straight through to the strength templates, and the day type
was written as `weights`.

It compounded: the yoga branch of onboarding skips the equipment step (yoga
needs none), so `equipment_ids` was empty and `has_all_equipment` false. The
equipment hard-filter then cut the pool from 604 exercises to the 66 that need
none — and **nothing in the catalogue is a pulling movement without
equipment**. Both Pull days generated zero exercises, and starting one showed
"this session has no exercises" with no way forward.

Three fixes:

1. `generateProgram` returns early for `yoga` and `meditation`: a week of that
   practice plus rest, no strength templates, no exercises.
2. A training day that fills no slots now backfills from whatever is eligible
   rather than shipping empty.
3. `createBlockForUser`'s "all days empty" guard now checks `length > 0` first.
   `[].every()` is true, so without it every yoga plan would have been rejected
   as unbuildable — a bug introduced by fix 1 and caught before shipping.

Today also warns when a strength track has no equipment recorded, since that is
the misconfiguration behind the thin plan.

Covered by regression tests 12 and 13 in `scripts/test-generator.ts`.

## Known gaps

- ~~Progression is not yet implemented.~~ **Done in step 08** — see
  [08-progression.md](08-progression.md).
- ~~Deload prescriptions are not reduced.~~ **Done in step 08**:
  `startSession` applies `applyDeload()` to the set count and the suggested
  weight drops to about 70%.
- Yoga days generate no content yet; `yoga_playlists` is empty.
- No warm-up is attached to a day yet. `warmup_exercises` is seeded and
  injury-aware selection is designed, but not wired.
- ~~Blocks do not auto-roll at four weeks.~~ **Done in step 11** — see
  [11-block-rollover.md](11-block-rollover.md).

## Change log

- Initial engine, splits, prescription, persistence and 30 tests.
- Step 08 implemented progression and deload dosing; gaps above updated.
- Step 11 added carry-over between blocks (`carryOver`, `CARRY_OVER_SLOTS`).
- Fixed yoga/breathing tracks being given a strength split, and empty training days.
- Added `buildPlan()` and a Today button, for users who onboarded before block
  generation existed.
- **2026-09-13.** QA pass 2: a day filled by the empty-day backfill is now labelled "Full body" rather than keeping its template name, which had produced a "Pull" day of four core exercises for a bodyweight user. The deeper findings on the pattern data and on `score()` penalising equipment are open — see [17](17-qa-pass-2.md) and [QA-FINDINGS-2.md](../QA-FINDINGS-2.md).
- **2026-09-13.** `prescribe()` returns a seconds range for an exercise whose metric is `seconds`, so a plank is no longer prescribed as 8–12 reps. See [18](18-timed-exercises-and-tomorrow.md).
- **2026-09-13.** `createBlockForUser` takes `mode`: a **rebuild** keeps the active block's number and `started_on`, only a **rollover** starts a new one. Every rebuild used to increment the block and reset the start date, which moved the deload week and took one account to "Block 23 · Week 1 of 4". Because the generator is seeded on the block number, a rebuild with unchanged answers is now idempotent. See [19](19-qa-pass-2-remainder.md).
- **2026-09-13.** A first block generated from a real signup (general fitness, beginner, bodyweight at home, yoga mat + pull-up bar) contained **no push-up**: both horizontal-press slots went to isometric holds, with twelve equipment-free beginner compound presses eligible and `Pushups` among them. Everything ties in `score()` — same pattern, mechanic, level and equipment count — so the seeded RNG decides, and nothing in the generator can express that a push-up is the staple and an isometric squeeze is the regression for someone who cannot do one. `block_number` was correctly **1**, and timed exercises were prescribed as `2 x 20-45s`, so the metric reaches a first block properly. The scoring problem is [H3](../QA-FINDINGS-2.md) and remains Dhananjay's call.
