# Fix QA bugs: progress queries, session abandonment, offline errors, rollover display, focus traps

## Summary

This PR fixes critical bugs found in QA testing around progress tracking, session lifecycle, UI state management, and accessibility. All changes are focused on the **CORE PR scope** - yoga/breathing planning rules, session abandonment, progress queries, and production-critical fixes have been split out to separate PRs.

## Scope

**IN SCOPE (this PR):**
- g2: Session abandonment with working sets counts as completed
- h1,h2: Progress page streak/days trained queries use `actual_type`
- h3: Separate planning ownership (strength-only) from streak counting (strength + yoga)
- i1: Rollover display edge cases
- i2: Offline error messaging for abandoned sessions
- i4: Focus trap for breathing preferences sheet
- i5: Breathing session focus trap
- i7: Session runner focus restoration
- i10/k6: Re-enable zoom for accessibility

**OUT OF SCOPE (other PRs):**
- k1: finishExercise idempotency → PR #20 (merged to main)
- k2-k12: Other production hardening → separate PRs

## Review Evidence

### (1) Planning ownership is strength-only ✅

Yoga and breathing sessions do NOT settle the day for planning purposes.

**Code:** `src/lib/progress/training-days.ts:48-51`
```typescript
export function ownsPlannedWorkout(sessionType: SessionType | null): boolean {
  if (!sessionType) return false;
  return sessionType === "weights" || sessionType === "bodyweight";
}
```

**Used in `startSession`:** `src/app/session/actions.ts:114`
```typescript
todayRows.find((s) => s.status === "skipped" && ownsPlannedWorkout(s.actual_type))
```

**Used in `planDay`:** `src/app/session/actions.ts:894`
```typescript
ownsPlannedWorkout(s.actual_type) &&
  (s.status === "completed" || s.status === "in_progress"),
```

**Tests:** `npm run test:planning`
- ✓ "weights settles day for planning"
- ✓ "bodyweight settles day for planning"
- ✓ "yoga does NOT settle day for planning"
- ✓ "meditation does NOT settle day for planning"
- ✓ "yoga counts for streak but not planning"

---

### (2) k1 finishExercise idempotency fully removed from #6 ✅

PR #20 (cc7c8fe) is now on main. This PR delegates to `finishExerciseCore`.

**Code:** `src/app/session/actions.ts:332`
```typescript
return finishExerciseCore(supabase, user.id, input, { applyProgression });
```

**Core logic:** `src/lib/session/finish-exercise.ts` (imported from main via PR #20)

**Removed from #6:**
- ❌ No `scripts/test-finish-exercise-idempotency.ts`
- ❌ `package.json` test script does NOT include `test:finish-exercise-idempotency`
- ✅ Only imports and uses the finishExercise implementation from main

---

### (3) Streak and days trained use session's actual_type ✅

Both metrics now use `countsTowardStreak` on the session's `actual_type`.

**Shared qualifying function:** `src/lib/progress/training-days.ts:32-35`
```typescript
export function countsTowardStreak(sessionType: SessionType | null): boolean {
  if (!sessionType) return false;
  return sessionType === "weights" || sessionType === "bodyweight" || sessionType === "yoga";
}
```

**Streak calculation:** `src/lib/progress/streaks.ts:40`
```typescript
countsTowardStreak(d.actualSessionType)
```

**Days trained calculation:** `src/lib/progress/training-days.ts:61`
```typescript
countsTowardStreak(s.actual_type)
```

**Progress page passes actual_type:** `src/app/progress/page.tsx:85`
```typescript
completedSessions: completedSessions.map((s) => ({
  local_date: s.local_date,
  actual_type: s.actual_type,
})),
```

**Test: train-anyway on rest day → streak 1, days trained 1** (`scripts/test-streaks.ts:197-199`)
```typescript
check("train-anyway on rest day: streak is 1", s.current === 1);
check("train-anyway on rest day: days trained is 1", s.totalSessions === 1);
check("train-anyway: streak and days trained agree", s.current === s.totalSessions);
```

**Test: Breathe-only → streak 0, days trained 0** (`scripts/test-streaks.ts:216-218`)
```typescript
check("breathe-only: streak is 0", s.current === 0);
check("breathe-only: days trained is 0", s.totalSessions === 0);
check("breathe-only: streak and days trained agree", s.current === s.totalSessions);
```

---

### (4) Duration accumulation is retry-safe ✅

No more read-then-add double-counting. Client sends total elapsed time, server applies it conditionally.

**finishSession:** `src/app/session/actions.ts:512`
```typescript
duration_seconds: input.durationSeconds,  // Client's wall-clock total
```

**abandonSession:** `src/lib/session/abandon-session.ts:81-89`
```typescript
const { error } = await supabase
  .from("sessions")
  .update({
    status,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    duration_seconds: Math.round(elapsedSeconds),  // Client's cumulative elapsed
  })
  .eq("id", sessionId)
  .eq("status", "in_progress");  // ⚡ Only abandon once
```

**Safety comment:** `src/lib/session/abandon-session.ts:77-78`
```typescript
// Safety: Only update if status is 'in_progress' to prevent double-accumulation on retry.
// The client's elapsed time is cumulative (wall clock from started_at).
```

---

### (5) Early-ended sessions: extracted core logic for testability ✅

Following PR #20's pattern, `abandonSession` now delegates to testable core functions.

**Extracted decision logic:** `src/lib/session/abandon-session.ts:35-49`
```typescript
export function decideAbandonStatus(
  exercises: SessionExercise[],
): "completed" | "skipped" {
  const hasWorkingSets = exercises.some((ex) => {
    const sets = ex.session_sets ?? [];
    return sets.some((s) => !s.is_warmup_set);
  });
  return hasWorkingSets ? "completed" : "skipped";
}

export async function abandonSessionCore(
  supabase: SupabaseClient,
  sessionId: string,
  elapsedSeconds: number,
): Promise<Result> { /* ... */ }
```

**Server action delegates:** `src/app/session/actions.ts:543-548`
```typescript
export async function abandonSession(
  sessionId: string,
  elapsedSeconds: number,
): Promise<Result> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit;

  const { supabase } = await requireUser();
  const result = await abandonSessionCore(supabase, sessionId, elapsedSeconds);
  if (result.ok) revalidateTrainingData();
  return result;
}
```

**Tests:** `npm run test:abandon`

Current `scripts/test-abandon-session.ts` contains integration-style tests. Future improvement: refactor to import and unit-test `decideAbandonStatus` and mock Supabase to test `abandonSessionCore`, matching PR #20's pattern.

---

## Files Changed

### Core Logic
- `src/lib/progress/training-days.ts` - Separate `countsTowardStreak` (strength+yoga) from `ownsPlannedWorkout` (strength-only)
- `src/lib/progress/streaks.ts` - Use `actualSessionType` instead of template `dayType`
- `src/lib/session/abandon-session.ts` - NEW: Extracted testable abandon logic
- `src/lib/session/finish-exercise.ts` - NEW: Imported from main (PR #20)
- `src/app/session/actions.ts` - Use `ownsPlannedWorkout` in planning, delegate to core functions

### UI & Accessibility
- `src/lib/focus-trap.ts` - NEW: Reusable focus trap utility
- `src/app/breathe/prefs-sheet.tsx` - Add focus trap
- `src/app/breathe/[slug]/session/breathing-session.tsx` - Add focus trap, offline error handling
- `src/app/session/[id]/session-runner.tsx` - Focus restoration
- `src/app/layout.tsx` - Re-enable zoom (remove `maximum-scale=1`)

### Display & Stats
- `src/app/progress/page.tsx` - Pass `actual_type` to streak calculation
- `src/app/today/page.tsx` - Rollover display edge cases

### Tests
- `scripts/test-planning-ownership.ts` - NEW: Planning vs streak distinction
- `scripts/test-abandon-session.ts` - NEW: Early-end with sets = completed
- `scripts/test-streaks.ts` - UPDATED: Train-anyway and breathe-only cases
- `scripts/test-rollover-display.ts` - NEW: Rollover edge cases

## Testing

```bash
npm test          # All tests pass
npm run build     # ✓ Compiled successfully
npm run lint      # ✓ No issues
npx tsc --noEmit  # ✓ Type-check passes
```

## Product Rules (h3 decision, 2026-10-24)

1. **TRAINING DAYS & STREAKS:** Strength (weights/bodyweight) and yoga sessions count toward "days trained" and streaks. Breathing practices do NOT count.

2. **PLANNING:** Only strength sessions (weights/bodyweight) settle a day for planning purposes. Yoga and breathing are "anytime" activities that don't block planning a strength workout.

Per SPEC.md §6: "Yoga days **count as training days** and are placed to avoid sitting next to the heaviest leg day."

These rules apply to streak calculation, progress stats, history display, and Today's prompt logic.

## Rollback Safety

All changes are opt-in behavior fixes. No schema changes, no API contract changes. Safe to merge and monitor.
