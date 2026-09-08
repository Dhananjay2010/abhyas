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
| `scripts/test-generator.ts` | 30 checks against the real catalogue |

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

## Known gaps

- Progression is **not yet implemented**. The schema (`exercise_progress`) and
  the rules (double progression, +1.25/2.5/5 kg, stall rule) are specified, but
  nothing updates working weights yet — that arrives with session logging.
- The deload week is stored (`deload_week = 4`) and surfaced on Today, but
  prescriptions are not yet reduced during it. `applyDeload()` exists and is
  unused.
- Yoga days generate no content yet; `yoga_playlists` is empty.
- No warm-up is attached to a day yet. `warmup_exercises` is seeded and
  injury-aware selection is designed, but not wired.
- Blocks do not auto-roll at four weeks; a new one needs "Rebuild this block".

## Change log

- Initial engine, splits, prescription, persistence and 30 tests.
- Added `buildPlan()` and a Today button, for users who onboarded before block
  generation existed.
