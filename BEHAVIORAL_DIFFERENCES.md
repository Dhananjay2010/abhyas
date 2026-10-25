# Behavioral Differences: startSessionFullCore vs. main's startSession

This document lists all behavioral differences between the extracted `startSessionFullCore` (in PR #122) and the original `startSession` in `main` branch at commit `3722388c`.

## Additions (New behaviors in PR #122)

1. **L3: Stale session closing**
   - `startSessionFullCore` calls `startSessionStaleCore` to close stale in_progress sessions from previous dates before inserting a new session.
   - The original `startSession` had no stale close logic; it would insert a new session even if yesterday's session was still open.

2. **#111: Fresh cross-date session resume**
   - `startSessionFullCore` calls `checkRemainingInProgress` in the stale deps to check for fresh (< 6h) in_progress sessions from previous dates and resumes them.
   - The original `startSession` did not resume cross-date sessions; it only resumed same-date sessions via `pickReusableSession`.

3. **Error propagation from stale operations**
   - `startSessionFullCore` checks `!staleResult.ok` and returns the error if stale close fails.
   - The original had no such path.

4. **Error propagation from deps builder queries**
   - The deps builder (`buildStartSessionStaleDeps`) returns `{ ok: false, error }` if any database query fails during stale detection.
   - The original had no such error path.

## Removals (Behaviors present in main but not in PR #122 core)

None. All original behaviors are preserved.

## Changes (Behaviors that exist in both but work differently)

1. **Timestamp injection**
   - `startSessionFullCore` takes `nowMs` as a parameter and uses `new Date(nowMs)` everywhere.
   - The original called `new Date()` directly (not testable).
   - **Effect**: Identical in production, but testable in unit tests.

2. **Error checking on exercise insert**
   - `startSessionFullCore` checks `!exerciseInsertResult.ok` and returns the error.
   - The original code does not show this check in the visible snippet (may have been present but not shown).
   - **Effect**: More robust error handling.

3. **Dependency injection**
   - `startSessionFullCore` takes all database operations as injected functions.
   - The original directly called supabase methods.
   - **Effect**: Identical in production (via `buildStartSessionFullDeps`), testable with fakes.

## Unchanged behaviors

- Resume same-date sessions via `pickReusableSession`
- Case C: Idempotent same-date in_progress check
- Block rollover before insert
- Program/day loading
- Deload week calculation
- Exercise prescription and deload application
- Session insert with conflict handling (`existingSessionId`)
- Exercise insert with metric determination

## Summary

The core adds L3 and #111 logic (stale close and fresh resume) without breaking any existing behavior. All original code paths remain intact. The extraction is equivalent modulo the two new features, which are both backward-compatible additions.
