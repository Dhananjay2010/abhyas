# Hand Mutants for rest-swap-label-followup-a723

## Item 1: Label collision detection (resolveTomorrowAfterSwap)

**Location**: `src/lib/program/day-plan.ts:164`

**Original**:
```typescript
if (doneLabel !== tomorrowLabel) {
```

**Mutant**: Change to `if (true)` (always detect collision)
**Killing Test**: test-rest-swap-label-followup.ts test 3 "3-day control: Tue swap B → Wed resolves C (no duplicates)"
**Why it kills**: When B is swapped on Tue, doneLabel="Full Body B" and tomorrowLabel="Rest". Mutant would falsely detect collision and serve alternate day instead of C.

---

## Item 2: tomorrowIsRest prop (DayPlanPrompt)

**Location**: `src/components/day-plan-prompt.tsx:114`

**Original**:
```typescript
{showRestOption && !tomorrowIsRest && <Choice ...>Rest</Choice>}
```

**Mutant 2a**: Change to `{showRestOption && <Choice ...>Rest</Choice>}` (drop `!tomorrowIsRest`)
**Killing Test**: test-day-plan-prompt-dom.tsx test 1 "Tomorrow is Rest → only 'Keep it' and 'Swap the day' (no 'Rest')"
**Why it kills**: When tomorrowIsRest=true, mutant would show Rest button when it should be hidden.

**Mutant 2b**: Change to `{showRestOption && programDayId && !tomorrowIsRest && <Choice ...>Rest</Choice>}` (re-add broken programDayId check)
**Killing Test**: test-day-plan-prompt-dom.tsx test 3 "Today missed-yesterday (null id, showRestOption true) still shows Rest"
**Why it kills**: When programDayId=null on Today's missed-yesterday prompt, mutant would hide Rest button.

---

## Item 4: DOM test assertion (test-day-plan-prompt-dom.tsx)

**Location**: `scripts/test-day-plan-prompt-dom.tsx:59`

**Original**:
```typescript
assert.ok(!restButton, "Should NOT have separate 'Rest' button");
```

**Mutant**: Change to `assert.strictEqual(restButton, undefined, "Should NOT have separate 'Rest' button");`
**Killing Test**: test-day-plan-prompt-dom.tsx test 1
**Why it kills**: On mutant drop of `!tomorrowIsRest`, restButton would be a DOM node. `strictEqual` on DOM node comparison would hang/timeout instead of failing cleanly.

---

## Item 5: actual_type filters (LOW-1)

**Location 5a**: `src/lib/program/day-plan.ts:165` (getYesterdaySession)

**Original**:
```typescript
.in("actual_type", ["weights", "bodyweight"])
```

**Mutant 5a**: Drop the filter
**Killing Test**: test-rest-swap-label-followup.ts test 10 "nextDayPlan with sessionId: Tue swap B + yoga → Wed resolves C"
**Why it kills**: After B swap + yoga same day, without filter would pick yoga (newest) and fail to recognize B swap, serving wrong day.

---

**Location 5b**: `src/lib/program/day-plan.ts:243` (getTodayCompletedSession with currentSessionId)

**Original**:
```typescript
.in("actual_type", ["weights", "bodyweight"])
```

**Mutant 5b**: Drop the filter
**Killing Test**: test-rest-swap-label-followup.ts test 10 "nextDayPlan with sessionId: Tue swap B + yoga → Wed resolves C"
**Why it kills**: When currentSessionId points to B but yoga happened after, without filter would pick wrong session for next-up calculation.

---

**Location 5c**: `src/lib/program/day-plan.ts:253` (getTodayCompletedSession without currentSessionId)

**Original**:
```typescript
.in("actual_type", ["weights", "bodyweight"])
```

**Mutant 5c**: Drop the filter
**Killing Test**: test-rest-swap-label-followup.ts test 11 "nextDayPlan without sessionId: Tue swap B + yoga → Wed resolves C"
**Why it kills**: After B swap + yoga same day, without filter would pick yoga (newest) and fail to recognize B swap.

---

## Item 6: plannableDays currentSessionId scoping (MED-B)

**Location**: `src/lib/program/day-plan.ts:238-247`

**Original**:
```typescript
if (options.currentSessionId) {
  const { data } = await supabase
    .from("sessions")
    .select("id, program_day_id")
    .eq("id", options.currentSessionId)
    .eq("user_id", options.userId)
    .in("actual_type", ["weights", "bodyweight"])
    .maybeSingle();
  recentSession = data;
}
```

**Mutant 6a**: Change to broad query (drop `.eq("id", options.currentSessionId)`)
```typescript
if (options.currentSessionId) {
  const { data } = await supabase
    .from("sessions")
    .select("id, program_day_id")
    .eq("user_id", options.userId)
    .in("status", ["completed", "in_progress"])
    .in("actual_type", ["weights", "bodyweight"])
    .lte("local_date", options.afterDate)
    .order("local_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  recentSession = data;
}
```
**Killing Test**: test-rest-swap-label-followup.ts test 12 "plannableDays with currentSessionId: uses exact session (not latest)"
**Why it kills**: With two sessions same date (B in_progress, C completed later), mutant would pick C (latest) instead of B (currentSessionId), showing wrong nextUp badge.

---

**Mutant 6b**: Drop currentSessionId entirely from nextDayPlan call
**Location**: `src/lib/program/day-plan.ts:660`

**Original**:
```typescript
return await plannableDays(supabase, program.id, {
  afterDate: today,
  userId,
  currentSessionId: options?.sessionId,
});
```

**Mutant**: Change to
```typescript
return await plannableDays(supabase, program.id, {
  afterDate: today,
  userId,
});
```
**Killing Test**: test-rest-swap-label-followup.ts test 13 "nextDayPlan passes currentSessionId to plannableDays"
**Why it kills**: With B in_progress and C completed later same day, mutant would badge wrong day (based on C instead of B).

---

## Item 7: MED-B DOM cases

No hand mutants needed - synthetic DOM tests were dropped. Real tests 6-7 in test-rest-swap-label-followup.ts and tests 12-13 cover the logic comprehensively.

---

## Item 8: Optional fixtures

Skipped - existing test coverage (5-day, 6-day) is sufficient.
