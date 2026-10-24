# Integration Note for PR #25

When integrating the workout session offline queue (PR #25) with this PR (#37):

## 1. clearOutbox() Integration
The `clearOutbox()` call should be added to `runFinish` and `runEndEarly` in `src/lib/session/finish-flow.ts` after successful completion (when `result.ok === true`), before any navigation or phase transitions.

```typescript
// In runFinish, after result.ok check:
if (result.ok) {
  clearOutbox(); // Clear any queued operations
  deps.setError(null);
  // ... rest of success handling
}

// In runEndEarly, after result.ok check:
if (result.ok) {
  clearOutbox(); // Clear any queued operations
  params.setConfirming(null);
  // ... rest of success handling
}
```

## 2. useElapsed Form
PR #25 should use the `{elapsed, stop, resume}` destructured form of `useElapsed`:

```typescript
const { elapsed, stop: stopElapsed, resume: resumeElapsed } = useElapsed(startedAt);
```

This form is already used in the session runner and provides:
- `elapsed: number` - current elapsed seconds
- `stop: () => number` - stops the timer and returns frozen seconds
- `resume: () => void` - resumes the timer from frozen state

The `stopElapsed()` and `resumeElapsed()` functions are passed to `runFinish` and `runEndEarly` as part of the dependencies.

## 3. Offline Handling Pattern
Follow the same network error detection pattern:
- Use `isNetworkError(err)` from `src/lib/session/network-error.ts`
- Show user-friendly offline messages instead of raw error text
- Keep operations resumable after connectivity is restored
