# 07 — Guided session

## What this delivers

The timer-driven session that runs a workout: warm-up, exercise-by-exercise
work with set logging and rest timers, cool-down, and a summary.

## Files

| File | Role |
|---|---|
| `src/app/session/actions.ts` | Start/resume, log sets, finish, swap |
| `src/app/session/[id]/page.tsx` | Server component; loads session, settings, warm-up |
| `src/app/session/[id]/session-runner.tsx` | The runner (client) |
| `src/lib/session/device.ts` | Wake lock, beeper, elapsed clock |
| `src/lib/program/warmup.ts` | Injury-aware warm-up selection |
| `src/app/today/start-session-button.tsx` | Start / Resume entry point |
| `src/app/dev/session/*` | Development-only harness |

## Phases

`warmup → work → cooldown → done`

1. **Warm-up** — one item per screen, labelled by purpose: raise your heart
   rate / mobility for today's muscles / prehab for a joint you flagged.
2. **Work** — one exercise per screen: planned sets and rep range, the cue, a
   set list, and inputs for the next set.
3. **Cool-down** — static stretches, skippable, controlled by
   `user_settings.cooldown_enabled`.
4. **Done** — time, sets logged, total volume, exercises completed.

## Warm-up selection

`selectWarmup()` builds roughly 15 minutes:

- **Cardio (5 min)** — chosen by track: a bike or rower for gym users,
  marching or skipping at home.
- **Mobility (5 min)** — warm-ups whose `target_muscles` overlap the muscles
  today's exercises train, ranked by overlap. Backfilled with general spine and
  hip drills if fewer than three match.
- **Prehab** — warm-ups whose `target_regions` match a flagged joint.

**Prehab uses both current and past injuries**, unlike the generator's
eligibility filter which only hard-filters current ones. A past injury should
not stop you training a movement, but it is exactly what is worth warming up.

## Decisions and why

### Resume is the default, not a special case

`startSession()` looks for a `planned` or `in_progress` session on today's
local date and returns it untouched rather than creating a second one. The
runner then resumes at the first exercise still `pending`, with previously
logged sets already displayed. People lock their phone mid-workout; losing the
sets would be unforgivable.

### Rest does not start after the final set

There is nothing to rest for. The condition is
`nextSetNumber < current.plannedSets`. Worth stating because it is easy to
misread when testing: a rest timer visible right after the last set is usually
the *previous* set's timer still running.

### The rest timer counts to a timestamp, not by decrement

`restEndsAt` is an absolute time and the interval recomputes the remainder, so
backgrounding the tab does not cause drift.

### Weight carries forward, reps reset

Each set's inputs pre-fill with the last logged weight for that exercise and
the top of the target rep range. `SetEntry` is remounted per set via a `key`
rather than reset from an effect — React now flags `setState` inside effects.

### Swap reuses the generator's eligibility rules

`findAlternatives()` filters candidates through `isEligible()` from
`src/lib/program/generate.ts`, so **a swap cannot route around the equipment,
level, injury, BMI or age filters**. Alternatives share the movement pattern
and exclude exercises already in the session.

Swapping is only offered before the first set is logged.

### Device capabilities are reported, never assumed

`src/lib/session/device.ts` treats wake lock, audio and vibration as things
that may simply not work:

- **Screen Wake Lock** needs iOS 16.4+, and is dropped whenever the tab hides,
  so it is re-acquired on `visibilitychange`.
- **`navigator.vibrate` has never been implemented in Safari**, on any version.
- **Audio will not play** until an `AudioContext` has been resumed inside a
  real user gesture, so every pointer-down in the session unlocks it.

The session screen prints the real state — "screen kept awake", "sound arms on
first tap", "vibration unsupported here", or the actual wake-lock error. That
way a user whose timer is silent can say what happened without opening a
console.

## Verification performed

Driven end to end through the development harness
(`/dev/session`, development only, double-gated like the onboarding one):

- All three warm-up phases render with the correct purpose labels
- Set logging: "10 reps · 60 kg" recorded, next set pre-filled with 60 kg and
  reps reset to target
- **Rest countdown observed ticking** 0:07 → 0:05 → 0:03 → 0:01 → cleared
- Rest fires between sets but **not** after the final set
- Feel check appears after the last set and advances to the next exercise
- Swap lists alternatives, applies the choice, and disappears once a set is
  logged
- Cool-down and summary correct: 7 sets, 2760 kg volume, 2 of 2 exercises

The capability readout proved itself during testing: it reported the genuine
wake-lock failure `The requesting page is not visible`, because the browser
pane was hidden.

## Bug: an existing session could be handed back empty

`startSession` returned early when a session row already existed for today,
without checking whether it had any exercises attached. A row created by an
abandoned attempt — or by a yoga or breathing session earlier the same day —
would be returned as an empty shell, and because the same branch ran on every
retry, the user was stranded permanently on "this session has no exercises".

`ensureSessionExercises` now runs on both the create and the resume path. It is
idempotent, does nothing when rows exist, and skips yoga and breathing sessions,
which have no exercises by design. The empty-session screen also explains what
to check instead of just stating the fact.

## Bug: the session summary was never shown

`finishSession` called `revalidatePath("/today")`. That refreshed the session
route, whose `status === "completed"` guard then redirected to Today before the
client could paint the summary — so the user never saw their time, volume, or
the "what changed for next time" progression messages, which are the payoff of
the whole workout.

The revalidation is gone. Today is refreshed when the user leaves the summary,
which it already did.

## Known gaps

**Not verified from here, and it matters:**

- The real signed-in flow — server actions writing under an actual session.
  The harness stubs persistence.
- **Wake lock, beep and vibration on a real phone.** These were exercised in a
  desktop browser only. iOS Safari is the case that will differ, and vibration
  will definitely not work there.

**Not built yet:**

- Progression. Logged sets are stored but nothing updates
  `exercise_progress`, so weights do not yet go up. This is the next step.
- Warm-up sets (`session_sets.is_warmup_set`) are never written; the ramp-up
  sets described in `SPEC.md` section 7 are not implemented.
- Cool-down reuses mobility warm-ups rather than dedicated static stretches.
- The end-of-session "what about tomorrow?" prompt is not built.
- Yoga and breathing sessions have no runner — the session is strength-only.

## Change log

- Initial guided session: phases, set logging, rest timer, wake lock, summary.
- Added exercise swap, filtered through the generator's eligibility rules.
- Fixed startSession handing back a session with no exercises.

## Bug: ambiguous PostgREST embeds broke the session, progression and swap

Found by testing the deployed app against a real account, 2026-09-09. This is
the most consequential defect found so far.

`session_exercises` has **two** foreign keys to `exercises` — `exercise_id` and
`swapped_from_exercise_id`. A bare `exercises(...)` embed is therefore
ambiguous, and PostgREST rejects the **entire query** with `PGRST201`. Four
queries did exactly that, and each silently degraded to an empty result:

| Query | Consequence |
|---|---|
| Session page | "This session has no exercises" even with five attached — the reported bug |
| `applyProgression` | No working weight was ever updated |
| `findAlternatives` | Swap never returned anything |
| History detail | Rendered no exercises at all |

The fix names the foreign key: `exercises!session_exercises_exercise_id_fkey(…)`.
The hint only disambiguates — the returned key is still `exercises`, so the
property access does not change.

**Why it survived every harness:** the harnesses inject fixture data and stub
persistence, so they exercise layout and interaction and never the query. Type
checking cannot catch it either, because the generated types describe the
relationship as valid; only PostgREST decides at runtime that it is ambiguous.

To stop it recurring, the session and history pages now **throw on a query
error** instead of falling through to an empty list. A failed query and a
genuinely empty session are no longer indistinguishable.

**Rule for this schema:** any table with more than one foreign key to the same
parent must name the constraint in its embeds. Today that means
`session_exercises → exercises` and `exercise_substitutions → exercises`.

## Bug: Today called the day done because of a breathing session

`Today` picked the most recent session row of any type to decide state, so a
one-minute breathing session made it announce "Session complete", hide the
Start button, and lock the user out of their actual workout for the rest of the
day. It now judges per training type: only a completed `weights` or
`bodyweight` session counts as the day's workout being done.
