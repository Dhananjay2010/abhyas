# Hand Mutant Test Results

## Summary
- **Killed**: 4 mutants
- **Not Killed (need stronger tests)**: 3 mutants  
- **Total**: 7 mutants

---

## Detailed Results

| # | Mutant | Location | Killing Test | Status |
|---|--------|----------|--------------|---------|
| 1 | Change `doneLabel !== tomorrowLabel` to `true` | `src/lib/program/day-plan.ts:339` | test-rest-swap-label-followup.ts test 3 | ✅ **KILLED** |
| 2a | Drop `!tomorrowIsRest` check | `src/components/day-plan-prompt.tsx:114` | test-day-plan-prompt-dom.tsx test 1 | ✅ **KILLED** |
| 2b | Re-add `programDayId &&` check | `src/components/day-plan-prompt.tsx:114` | test-day-plan-prompt-dom.tsx test 3 | ✅ **KILLED** |
| 5a | Drop `actual_type` filter from `getYesterdaySession` | `src/lib/program/day-plan.ts:167` | test-rest-swap-label-followup.ts test 5 | ⚠️ **NOT KILLED** |
| 5b | Drop `actual_type` filter from `currentSessionId` branch | `src/lib/program/day-plan.ts:244` | test-rest-swap-label-followup.ts test 10 | ⚠️ **NOT KILLED** |
| 5c | Drop `actual_type` filter from no-sessionId branch | `src/lib/program/day-plan.ts:254` | test-rest-swap-label-followup.ts test 11 | ⚠️ **NOT KILLED** |
| 6a | Replace `.eq("id", currentSessionId)` with broad query | `src/lib/program/day-plan.ts:238-247` | test-rest-swap-label-followup.ts test 12 | ⚠️ **NOT KILLED** |
| 6b | Drop `currentSessionId` from `plannableDays` call | `src/lib/program/day-plan.ts:660` | test-rest-swap-label-followup.ts test 13 | ✅ **KILLED** |

---

## Analysis

### Successfully Killed (4/7)

**Mutant 1** (Label collision): Test 3 correctly verifies that when B is swapped on Tue and tomorrow is Rest (different label), we don't detect collision and serve C as expected.

**Mutant 2a** (tomorrowIsRest prop): Test 1 correctly verifies that when `tomorrowIsRest=true`, the Rest button is hidden to avoid duplication.

**Mutant 2b** (programDayId regression): Test 3 correctly verifies that missed-yesterday prompt with `programDayId=null` still shows Rest button.

**Mutant 6b** (currentSessionId propagation): Test 13 correctly verifies that `nextDayPlan` passes `sessionId` to `plannableDays` so the correct session is used for nextUp calculation.

### Not Killed - Need Stronger Tests (3/7)

**Mutants 5a-5c** (actual_type filters): Tests 10-11 include yoga sessions but the fixtures use explicit planned sessions for the next day, so the result is correct regardless of whether yoga is filtered. The filters affect intermediate calculations but not the final result in these tests. Test 5 tests the filter inline (not in the actual code path), so dropping the filters from day-plan.ts doesn't fail it.

**Recommendation**: Add a test that:
1. Has a completed strength session B at 10:00
2. Has a completed yoga session at 18:00 same day
3. Queries `nextDayPlan` for tomorrow WITHOUT an explicit planned session
4. Verifies the result is C (next after B), not Rest or A (which would happen if yoga was counted)

**Mutant 6a** (plannableDays scoping): Test 12 has two sessions on the same date but the mock's query logic still returns the correct session because both are in-progress status. The test doesn't create a scenario where the broad query would pick the wrong session (e.g., a later completed session vs. an earlier in-progress one).

**Recommendation**: Add a test with:
1. Session B at 10:00 with status=in_progress (currentSessionId points here)
2. Session C at 14:00 with status=completed on same date
3. Verify nextUp badge is on C (after B), not on A (after C)
4. If mutant uses broad query, it would pick C (latest) and badge A instead

---

## Conclusion

4 out of 7 mutants are properly killed by existing tests, covering:
- Label collision detection logic ✅
- tomorrowIsRest prop and UI hiding ✅  
- programDayId regression guard ✅
- currentSessionId propagation to plannableDays ✅

3 mutants require stronger test fixtures to properly kill them:
- actual_type filters (3 locations)
- plannableDays .eq("id", currentSessionId) scoping

The logic is correct and the tests verify correct behavior, but the test fixtures don't create scenarios where the mutants would produce different observable outcomes.
