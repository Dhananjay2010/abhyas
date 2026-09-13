# 08 — Progression from logged sets

## What this delivers

Working weights that actually go up. Logged sets now feed a double-progression
engine that decides the next session's load, and the result is shown to the
user as it happens.

## Files

| File | Role |
|---|---|
| `src/lib/program/progression.ts` | The engine — a pure function |
| `src/app/session/actions.ts` | `applyProgression()` on exercise completion |
| `src/app/session/[id]/page.tsx` | Loads `exercise_progress`, suggests the weight |
| `src/app/session/[id]/session-runner.tsx` | Shows working weight and what changed |
| `scripts/test-progression.ts` | 30 checks (`npm run test:progression`) |

`npm test` runs both suites. The generator suite reads
`scripts/fixtures/catalogue.json`, a committed export of the live catalogue, so
it runs offline; refresh it with `scripts/export-catalogue.sh` after changing
the exercise seed.

## The rules, as implemented

Per `SPEC.md` section 6.

**Success** means completing *every* planned set at the *top* of the rep range.
Three sets of twelve when four were planned is not success; nor is 12/12/12/9.

| Situation | What happens |
|---|---|
| Success | Weight goes up by the smallest sensible increment |
| Success **and** "easy" | Double increment |
| Missed once | Hold the weight, `consecutive_failures` = 1 |
| Missed twice in a row | Drop ~10%, reset the counter, build back |
| Deload week | Nothing is judged; weights held |
| No reps recorded | Nothing changes |

**Increments:** isolation +1.25 kg · upper compound +2.5 kg · lower compound
+5 kg. Lower body means squat, hinge, lunge and calf patterns.

**Bodyweight** has no plate to add, so it progresses on reps: the rep target
rises by 2 each success. Once the target has run four reps past the top of the
range, the engine asks for a harder variation instead, and
`upgradeVariation()` swaps the exercise in the active program for the next link
in its `progression_chain`.

**Personal bests** (weight, reps, estimated 1RM by Epley) are tracked on every
session, including sessions that count as a miss — a heavy failed triple is
still a data point worth keeping.

## Decisions and why

### Progression runs per exercise, not at the end of the session

`finishExercise` applies it. If a workout is cut short after three of five
exercises, those three still bank their progress. Waiting for
`finishSession` would throw that away.

### Deload weeks are not a test

Week 4 deliberately holds every weight and records no failures. Judging
progress on a week designed to be easy would trigger the stall rule on lifts
that are fine.

Deloads now affect the session in two ways: `startSession` reduces the set
count via `applyDeload()`, and the suggested weight drops to about 70% of the
working weight, rounded to a loadable increment.

### `daily_menu` mode writes nothing

When `user_settings.planning_mode` is `daily_menu`, `applyProgression` returns
early. History is untouched, so switching back to `progression` resumes from
the last known working weights — which is what `SPEC.md` section 6 promises.

### The user is told what changed

The decision returns a plain-English message — *"All sets at the top and it
felt easy — up to 65 kg"* — shown as a banner on the next exercise and
collected into a "what changed for next time" list on the summary. Progression
that happens invisibly is indistinguishable from no progression.

## Verification performed

**Engine** — `npm run test:progression`, 30 checks, all passing:

- Increment sizes correct for isolation, upper compound, lower compound
- 60 → 62.5 kg on success; 100 → 105 kg on a squat; 15 → 16.25 kg on a curl
- "Easy" doubles the jump to 65 kg
- Falling short holds; a missing set or a single short set both count as a miss
- Two misses back off 60 → 55 kg and reset the counter
- Deload weeks change nothing and record no failure
- Missing rep data changes nothing
- Bodyweight raises the rep target, then asks for a harder variation
- First time on a lift uses the weight actually lifted as the base
- Bests update even on a failed session (90 kg × 6 → e1RM 108)
- Deload suggests 70 kg from a 100 kg working weight

**Database** — against the live database with a throwaway user: insert under
RLS works, the upsert path updates rather than duplicating, another user's
progress is invisible, and forging a row for another user is blocked.

**UI** — through the development harness: working weight displayed, weight
field pre-filled from it, progression banner shown on the next exercise, and
the summary listing every change.

## Bug: a weight logged on a bodyweight exercise was discarded

The load path was gated on `meta.isBodyweight || heaviest === 0`, so an
exercise that happens to need no equipment took the rep-progression branch even
when the user had actually loaded it. Weighted sit-ups, dips and planks
progressed reps and **never stored the weight**.

The gate is now `heaviest === 0` — decided on what was actually lifted, not on
how the exercise is classified. The variation ladder still requires a genuinely
bodyweight movement, so an equipment exercise logged without weight cannot ask
for a harder variation.

## Known gaps

- The real signed-in path is still unverified from here; the harness stubs
  persistence and returns a fixed message.
- Deload reduces sets and the suggested weight, but the user can still type
  anything — nothing enforces going lighter.
- No progress charts yet. `exercise_progress` holds bests and e1RM but nothing
  renders them.
- Blocks still do not roll over automatically at four weeks.
- `session_sets.is_warmup_set` is still never written, so ramp-up sets are not
  part of progression.

## Change log

- Initial engine, wiring, deload application and 30 tests.
- **2026-09-13.** Double progression on time for timed exercises: +5s a step, a harder variation at 120s or a prompt to add weight where there is no chain, and no estimated one-rep max from a hold. See [18](18-timed-exercises-and-tomorrow.md).
- **2026-09-13.** `Decision` reports a `personalBest` — a best that was **beaten**, never one merely set, so a first session claims no record. Longest hold for timed work, most reps for unloaded work, heaviest set or best estimated 1RM for loaded work. The deload message no longer tells someone with no weights that their weights are held. See [19](19-qa-pass-2-remainder.md).
