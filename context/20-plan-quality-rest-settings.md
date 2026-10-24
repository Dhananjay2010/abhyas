# Plan Quality, Rest Days, and Settings Fixes — 2026-10-24

Fixes the "Must fix" items from the review findings to improve plan quality, make rest days useful, and ensure settings actually work.

## Problem

Four categories of issues blocked the app from shipping quality plans:

### 1. Plan quality (H3, H4, H2, and staple movements)
- **H3**: Equipment scoring penalized gym users. `score()` subtracted points for each piece of equipment needed, so a full-gym user got elevated push-ups instead of bench press.
- **H4**: Movement pattern tags were wrong often enough to matter. Flutter Kicks tagged as `hinge` (it's core), Butt Kicks as `squat` (cardio), Overhead Slam as `vertical_pull` (a throw), etc.
- **No staples**: Tied candidates picked randomly, so a beginner's first plan could have isometric chest squeezes twice instead of a push-up.
- **H2**: No-equipment users couldn't train back or shoulders — no inverted row, pike push-up, or table row in the catalogue. 7 of 13 patterns were unreachable.

### 2. Rest days (M6)
- Showed only "Nothing scheduled. Rest properly, or do something light."
- No active recovery suggestions, no "train today anyway" option.
- Spec promised options; the screen gave none.

### 3. Settings that do nothing (M7, resume_session)
- **preferred_session_minutes**: stored but never read. 30 vs 75 minutes gave identical plans.
- **resume_session toggle**: written to the database, never checked. Every session always resumed.

### 4. Missing error pages
- No `error.tsx`, `global-error.tsx`, or `not-found.tsx` — the default Next.js errors showed.

## Changes

### 1. Equipment scoring fix (H3)

**src/lib/program/generate.ts** — `score()` now takes `primaryTrack` and only penalizes equipment for bodyweight users:

```typescript
if (primaryTrack === "bodyweight") {
  s -= Math.max(0, ex.equipment_ids.length - 1);
}
```

A gym user no longer loses points for needing a barbell. Updated all call sites: `pickForSlot`, backfill, and `session/actions.ts` swap list.

### 2. Exercise tagging fixes (H4)

**scripts/build_exercise_seed.py** — Added specific pattern rules before the general ones:

```python
(r"\bflutter kicks?\b", "core"),
(r"\bbutt ?kicks?\b|\bleg butt ?kicks?\b", "cardio"),
(r"\boverhead slams?\b|\bball slams?\b|\bmedicine ball throws?\b|"
 r"\bbackward.*throws?\b", "other"),
(r"\bback fl(y|ies)\b.*bands?\b", "rear_delt"),
```

**supabase/migrations/20261024000001_fix_exercise_tags.sql** — Corrects the existing rows:
- Flutter Kicks: `hinge` → `core`
- Butt Kicks (all variants): `squat` → `cardio`
- Overhead Slam: `vertical_pull` → `other`, `mechanic` → `null`
- Backward Medicine Ball Throw: same
- Back Flyes with Bands: `horizontal_press` → `rear_delt`
- Lying Cambered Barbell Row: `isolation` → `compound`

### 3. Staple movement preferences

**src/lib/program/generate.ts** — Added `STAPLE_MOVEMENTS` map:

```typescript
const STAPLE_MOVEMENTS: Partial<Record<Pattern, string[]>> = {
  horizontal_press: ["pushups", "push-up-wide", "bench-press"],
  squat: ["bodyweight-squat", "goblet-squat", "barbell-squat"],
  hinge: ["romanian-deadlift", "glute-bridge", "deadlift"],
  horizontal_pull: ["barbell-row", "bent-over-row", "dumbbell-row"],
  vertical_pull: ["pullups", "chin-ups", "lat-pulldown"],
  vertical_press: ["pike-push-up", "overhead-press", "dumbbell-shoulder-press"],
};
```

`score()` adds +0.5 for a staple when `wantCompound && level === "beginner"`. Enough to win a tie, not enough to override mechanic or level fit.

### 4. No-equipment exercises (H2)

**supabase/migrations/20261024000000_add_no_equipment_exercises.sql** — Adds four new exercises:
- `inverted-row`: horizontal pull, beginner, bodyweight
- `table-row`: horizontal pull, beginner, bodyweight
- `pike-push-up`: vertical press, beginner, bodyweight
- `elevated-pike-push-up`: vertical press, intermediate, bodyweight

All are `equipment_ids = '{}'`, so they are reachable for users with no gear. Bodyweight-at-home users can now train back and shoulders.

### 5. Rest days made useful (M6)

**src/app/today/page.tsx** — Replaced the empty rest screen with:
- A sentence on why rest matters.
- An "Active recovery" card with Yoga and Breathe links.
- A `DayPlanPrompt` component: "Or train today anyway" — lets the user pick a different day type.

Same component already used for "What about tomorrow?" and "You missed yesterday", so the interaction is consistent.

### 6. Session length control (M7)

**src/lib/program/generate.ts** — Added `preferredSessionMinutes` to `GeneratorInput` and a helper:

```typescript
function exerciseCountForDuration(sessionMinutes: number, templateSlots: number): number {
  const workMinutes = Math.max(15, sessionMinutes - 15);
  const capacity = Math.floor(workMinutes / 7);
  return Math.max(2, Math.min(templateSlots, capacity));
}
```

Estimated 7 minutes per exercise (sets + rest). Warmup is 15 min regardless. A 30-min session cuts accessories; main lifts stay. The generator now slices `entry.slots` to `maxExercises` before picking.

**src/lib/program/persist.ts** — Passes `preferredSessionMinutes` from the profile into the generator input.

### 7. Resume session toggle (resume_session)

**src/app/session/actions.ts** — `startSession()` now reads `user_settings.resume_session`:

```typescript
const resumeEnabled = settingsRes.data?.resume_session ?? true;
const existing = resumeEnabled
  ? todayRows.find((s) => s.status === "planned" || s.status === "in_progress") ??
    todayRows.find((s) => s.status === "skipped" && ownsTheDay(s.actual_type))
  : todayRows.find((s) => s.status === "planned");
```

When disabled, a skipped or in-progress session is not resumed — only a planned one (from the "what about tomorrow?" prompt) is reused. Start creates a fresh session instead.

### 8. Error pages

Added three new files matching the app's style:
- **src/app/not-found.tsx**: 404 page with a link back to `/today`.
- **src/app/error.tsx**: Client error boundary with a "Try again" button.
- **src/app/global-error.tsx**: Root-level error boundary (requires its own `<html>` tag per Next.js).

All use the app's color tokens (`accent`, `muted`, etc.) and font classes.

## Tests

**scripts/test-generator.ts** — Added four new suites:

14. **Gym users should get proper main lifts**: checks that a full-gym user gets an exercise with equipment in the first slot, not bodyweight work.
15. **Beginners should reliably get staple movements**: verifies that a beginner bodyweight plan includes at least one staple (push-up, squat, bridge).
16. **Session length affects exercise count**: 30-min session has fewer exercises than 75-min, but still ≥2.
17. **No-equipment users can train back and shoulders**: checks that `horizontal_pull` and `vertical_press` patterns are present.

All existing tests still pass. Determinism holds.

## What changed where

| File | What |
|------|------|
| `src/lib/program/generate.ts` | Equipment scoring fix, staple bonus, session length control |
| `src/lib/program/persist.ts` | Pass `preferredSessionMinutes` to generator |
| `src/app/session/actions.ts` | Read and respect `resume_session` setting |
| `src/app/today/page.tsx` | Rest day active recovery + train-anyway prompt |
| `scripts/build_exercise_seed.py` | Pattern rule fixes for mis-tagged exercises |
| `supabase/migrations/20261024000000_*.sql` | Add no-equipment exercises, fix existing tags |
| `src/app/{error,global-error,not-found}.tsx` | Error pages |
| `scripts/test-generator.ts` | Four new test suites |

## Migration required

Two new migration files:
- `20261024000000_add_no_equipment_exercises.sql` — adds inverted row, pike push-up, etc.
- `20261024000001_fix_exercise_tags.sql` — fixes Flutter Kicks, Butt Kicks, Overhead Slam, etc.

**Do not apply to production until after PR review.** Run them locally first:

```bash
supabase db reset  # or supabase migration up
```

## What still needs owner decision

1. **H4 full curation pass**: The seed script now fixes the specific exercises QA found. The rules catch most cases, but a human pass over all 604 rows would catch edge cases the regex misses. Not blocking; the big errors are fixed.

2. **Daily menu mode**: `preferred_session_minutes` now works for the exercise count. The other half of daily-menu mode — "a fresh sensible session each day" with no repeating template — was never built. The generator doesn't consult `planning_mode`. This is a feature gap, not a bug in what's there.

3. **Active recovery day type**: The schema has `day_type = 'active_recovery'` but the generator never produces it and the prompt doesn't offer it as a standalone choice. The rest screen now suggests yoga/breathing as active recovery, which is what the spec implied. If active recovery should be a first-class day type, that's a larger change.

## Verification

Run the full test suite:

```bash
npm run build
npm run lint
npm run tsc
npm test
```

All checks pass. No regressions.

To verify the fixes manually:
1. Create a new beginner account with no equipment → should see push-ups, squats, inverted row, pike push-up.
2. Create a gym account with all equipment → first slot should be bench/barbell squat/etc, not elevated push-ups.
3. Set session length to 30 min, rebuild block → fewer exercises than 60 min.
4. Toggle "Resume session" off, start a session, quit, start again → fresh session, not resumed.
5. Land on a rest day → see active recovery card and "train today anyway" prompt.
