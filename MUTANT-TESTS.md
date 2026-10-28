# Mutant Test Evidence

## Swap Collision Same-Day vs Stale Mutant

**Mutant**: Remove `s.localDate !== today` check in `getTodayCompletedSession` (day-plan.ts:670)

```diff
-      if (!s || s.localDate !== today) return null;
+      if (!s) return null;
```

**Result**: Test `test-swap-collision-same-day-vs-stale` fails on case 2:

```
CRASH AssertionError [ERR_ASSERTION]: NO collision → Upper stays

'Lower' !== 'Upper'

    at main (/workspace/scripts/test-swap-collision-same-day-vs-stale.ts:225:10)
```

Without the `localDate !== today` check, stale sessions incorrectly trigger collision resolution, changing Upper to Lower.

## MED-2 Prompt/Strip Agreement Mutant

**Mutant**: Use different program_day_id in `plannableDays` justDone vs `nextDayPlan` sessionId

```diff
     justDone: {
-      programDayId: "pd-1",
+      programDayId: "pd-2",  // MUTANT
       actualType: "weights",
       localDate: "2026-10-26",
     },
```

**Result**: Test `test-med2-prompt-strip-agreement` fails:

```
CRASH AssertionError [ERR_ASSERTION]: Prompt and strip should agree

'Lower' !== 'Upper'

    at main (/workspace/scripts/test-med2-prompt-strip-agreement.ts:185:10)
```

When the prompt and strip use different completed sessions, they compute different Next up badges, proving they must use consistent inputs to agree.
