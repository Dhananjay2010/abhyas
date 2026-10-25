# Planted Bug Testing Results

All planted bugs were tested against `scripts/test-start-session-full-core.ts` by applying each break, running the test, capturing the failing assertion, and reverting.

## Bug a: Skip the stale core

**Applied break**: Commented out `await startSessionStaleCore(staleDeps)` and returned fake success

**Failing assertion**:
```
✗ L3: Stale session closed, then new start
  Close was not called
```

## Bug c2: Ignore resume decision from pickReusableSession

**Applied break**: Changed `if (existing)` to `if (false && existing)`

**Failing assertion**:
```
✗ Resume: planned session reused when resume enabled
  Planned session reused: expected "sess-planned", got "sess-new"
```

## Bug g: Remove Case C (idempotent same-date in_progress check)

**Applied break**: Changed `findInProgressToday` call to return empty array

**Failing assertion**:
```
✗ Case C: Idempotent same-date in_progress check
  Existing session returned (Case C): expected "sess-existing", got "sess-new"
```

## Bug h111: Drop the #111 resume logic

**Applied break**: Changed `if (!staleResult.shouldInsert)` to `if (false && !staleResult.shouldInsert)`

**Failing assertion**:
```
✗ #111: Fresh in_progress session resumed (< 6h)
  Fresh session resumed via #111: expected "sess-fresh", got "sess-new"
```

## Bug P5: Ignore ensureCurrentBlock error

**Applied break**: Changed `if (rolloverResult.status === "error")` to `if (false && ...)`

**Failing assertion**:
```
✗ P5: ensureCurrentBlock error returned
  Expected error, got ok
```

## Bug P6: Ignore program load error

**Applied break**: Changed `if (!loadResult.ok)` to `if (false && !loadResult.ok)`

**Failing assertion**:
```
✗ P6: loadProgram error returned
  Cannot read properties of undefined (reading 'started_on')
```

## Bug P7: Ignore insert result error

**Applied break**: Changed `if (!insertResult.ok)` to `if (false && !insertResult.ok)`

**Failing assertion**:
```
✗ P7: Insert error returned
  Expected error, got ok
```

## Bug P8: Skip exercise insert

**Applied break**: Changed `if (planned && planned.length > 0)` to `if (false && planned && ...)`

**Failing assertion**:
```
✗ P8: Exercises inserted after session
  Exercises were not inserted
```

## Bugs B2 and B5

**Bug B2** (second user filter) and **Bug B5** (date variation) are tested in `scripts/test-start-stale-close.ts`:

```
✓ Test (B2): Second user's in_progress row not closed (user_id filter works)
✓ Test (B5): today parameter changes outcome (same-date vs cross-date)
```

## Bug a2

**Bug a2** (dual code path in `buildStartSessionStaleDeps`) was fixed by making `nowMs` a required parameter and always routing through `closeStaleSessionsCore`. This eliminated the dual path, so there is no break to test.

## Summary

All planted bugs are caught by the test suite. Every break causes at least one test to fail with a clear assertion message.
