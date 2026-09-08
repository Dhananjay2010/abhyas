# 05 — Exercise catalogue

## What this delivers

604 exercises with the structural and safety metadata the block generator needs.

## How it is built

`scripts/build_exercise_seed.py` transforms the
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) dataset (876
entries) into a SQL migration. The script is committed and re-runnable:

```bash
python3 scripts/build_exercise_seed.py <exercises.json> <out.sql>
```

The seed is **idempotent** (`on conflict (slug) do update set …`), so
regenerating always produces an applicable migration.

## Licensing stance — important

Only **structural data** is imported: names, muscles, equipment, mechanic,
force, level. Those are facts about exercises.

**No images and no instruction prose are imported.** The repo carries the
Unlicense, but that covers the JSON, not the photographs — the data traces back
to `wrkout/exercises.json`, itself scraped from a large commercial fitness
site, and three separate GitHub issues asking whether the images are safe for
commercial use ([#2](https://github.com/yuhonas/free-exercise-db/issues/2),
[#12](https://github.com/yuhonas/free-exercise-db/issues/12),
[#13](https://github.com/yuhonas/free-exercise-db/issues/13)) are all
unanswered by the maintainer.

Instead each exercise gets a `cue`: a one-line summary generated from its own
attributes, e.g. *"Compound push movement targeting chest, front delts,
triceps. Barbell, Bench."*

`exercise_media` is currently **empty**. No YouTube IDs have been invented —
a fabricated ID produces a dead embed, which is worse than no embed. The plan
per `SPEC.md` section 10 is wger's CC-BY-SA photos plus real YouTube embeds for
v1, and a licensed GIF set (ExerciseDB, one-time perpetual licence) later.

## Filtering

Dropped from the 876:

| Reason | Count |
|---|---|
| Category not programmed (stretching, strongman, olympic weightlifting) | 179 |
| No usable equipment information (`other` / null) | 93 |

Stretching is dropped because there is a dedicated `warmup_exercises` library.
Olympic lifts are dropped because they are unsafe to auto-prescribe without
coaching.

## Derived metadata

Everything that decides whether someone gets hurt is computed here by explicit
rules, never taken from the source.

- **`movement_pattern`** — what the generator selects on. Name rules, ordered,
  first match wins; falls back to primary muscle.
- **`impact`** — `high` for plyometrics and jumping. Filters out at BMI ≥ 30.
- **`spinal_load`** — `high` when a loaded bar is involved in a squat or hinge.
  Filters out at age ≥ 50.
- **`contraindicated_regions`** — joints the movement loads. Hard-filtered
  against current injuries.
- **`tracks`** — `bodyweight` only if all required equipment is home-reachable.

## Three systematic faults found by auditing

These were found by checking the rules against known exercises rather than
trusting them, and each was fixed at the cause.

**1. Plurals matched nothing.** `\blunge\b` does not match "Lunges", and
`\bsquat\b` does not match "Squats". "Barbell Squat" received the knee
contraindication while **"Barbell Squats" did not** — a safety filter silently
failing on a large share of the catalogue. Every noun in the rules now tolerates
a trailing `s`.

**2. "Leg curl" was read as an arm curl.** The rule was
`\bcurl\b(?!.*leg)`, but the lookahead only checks text *after* the word, and
"leg" comes before. Fixed by ordering the hinge rule ahead of biceps.

**3. "Barbell Squat" scored low spinal load** because the rule wanted the
literal words "back squat". Spinal load now considers the equipment and the
movement pattern, not just the name: a loaded bar in a squat or hinge is high,
whatever it is called.

## Muscle reconciliation

An audit comparing each pattern against the muscles worked found 34 remaining
mismatches. Rather than add more name regexes, `reconcile()` corrects a name
match that disagrees with the muscles — but **only for small single-joint
patterns** where the dataset's labels are reliable.

The big compound patterns are deliberately excluded: the dataset labels several
deadlift variants as "quadriceps", and a deadlift is still a hinge.

This moved all 14 wrist/finger curls out of biceps into forearm, and glute
kickbacks out of triceps into hinge. Mismatches are now **0**.

## Verification performed

- Twelve known exercises checked for correct pattern, spinal load and
  contraindications — all pass.
- Catalogue-wide audit of pattern vs. muscles: 0 mismatches on small-muscle
  patterns.
- Row counts confirmed on the live database after each migration.

## Known gaps

- `exercise_media` is empty; no demonstrations yet.
- Only 14 exercises carry a `progression_chain`. Bodyweight progression is
  therefore thin outside push, pull, squat, dip, core and hinge.
- `exercise_substitutions` is empty; the swap feature will compute substitutes
  from muscles and equipment at runtime.
- Vertical pull (17) and rear delt (8) have thin coverage — a home user without
  a pull-up bar leans on the fallback pattern.
- Instruction text is a generated cue, not written coaching.

## Change log

- Initial import: 604 exercises, `movement_pattern` and `cue` columns added.
- Fixed plural matching, leg-curl misclassification and barbell spinal load.
- Added muscle reconciliation; shipped as `20260908210200_refresh_exercise_patterns.sql`
  because the original seed migration was already applied.
- Made the seed idempotent so future regenerations can be applied as migrations.
