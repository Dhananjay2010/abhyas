# Fix Rest Day Demo Path & Block-1 Sign-Up Anchoring

## Summary

Closes #165.

This PR resolves the rest-day swap regression where the demo path's collision resolution was skipped, causing users to see a stale red "Rest today" label after swapping, and enables new-user sign-up-weekday anchoring for block 1 only.

## Changes

### 1. Block-1 Sign-Up Anchoring
- **New users' first block (block 1) anchors** the training schedule to their sign-up weekday by setting `started_on` to today in the database
- **Extracted pure helper** `decideBlockStartedOn()` in `src/lib/program/persist.ts` that returns `today` for block 1, `undefined` for all other cases (rebuild or rollover to block 2+)
- Rebuild and rollover logic unchanged - RPCs handle date calculation
- **Known limitation**: If a new user rebuilds block 1 from Settings or rolls over to block 2, the anchor snaps back to the standard unanchored weekday pattern. Follow-up PR will carry forward the anchor across rebuilds and rollover.

### 2. Post-Swap Collision Resolution
- Unified collision resolution across UI (`src/app/today/page.tsx`) and execution path (`src/lib/session/start-session-full-core.ts`)
- **Pure helper functions** with dependency injection:
  - `resolveTodayProgramDayCore()` - collision resolution logic
  - `nextDayPlanCore()` - next-day plan preview
  - `loadTodayPlan()` - shared loader for Today page
  - `startSessionFullCore()` - session start with collision handling
- Removed dirty `as DayType` casts, replaced with typed constants and proper dependency interfaces

### 3. Removed Start Tomorrow Feature
- Removed `StartTomorrowLink` component and `startTomorrow` action from `src/app/today/`
- Removed unused imports: `resolveTimezoneWithProfile` from `actions.ts`
- Cleaned up unused `localHour` helper from `src/lib/dates.ts`

## Test Coverage

Test chain: **468 tests** (455 from main `831e2cb1` + 13 new)

### New Tests (13)
1. `test:demo-path-anchoring` - Anchored day indices for new block 1
2. `test:demo-path-new-plan-behavior` - New plan behavior validation
3. `test:rest-day-swap-preselect-dom` - DOM preselection after rest-day swap
4. `test:post-swap-collision` - Post-swap collision resolution
5. `test:existing-plan-schedule-unchanged` - Existing plans retain schedule
6. `test:today-plan-loader` - Today plan loader with collision
7. `test:next-day-plan-core` - Next-day plan core logic
8. `test:start-session-today-resolve` - Today session resolution
9. `test:start-session-full-core-collision` - Full core collision handling
10. `test:start-session-full-deps-resolve` - Deps resolution interface
11. `test:started-on-decision` - startedOn decision helper (block 1 vs 2+)
12. `test:started-on-mutant-a` - Generator block-agnostic verification
13. `test:started-on-mutant-b` - Persist block-1 check mutant killer

### Mutant Tests

| ID | Description | Test | Status |
|----|-------------|------|--------|
| (A) | `start-session-full-core` post-swap collision resolution | `test:start-session-full-core-collision` | ✓ Killed |
| (B) | `start-session-full-deps` interface resolution | `test:start-session-full-deps-resolve` | ✓ Killed |
| (a) | Generate anchors without block-1 check (block-agnostic) | `test:started-on-mutant-a` | ✓ Verified |
| (b) | Persist always passes `startedOn: today` | `test:started-on-mutant-b` | ✓ Killed |
| (ii) | Today page post-swap collision resolution | `test:post-swap-collision` | ✓ Killed |
| (iii) | Existing plan schedule unchanged | `test:existing-plan-schedule-unchanged` | ✓ Killed |
| (v) | Today plan loader collision handling | `test:today-plan-loader` | ✓ Killed |
| (vi) | Next-day plan core pure function | `test:next-day-plan-core` | ✓ Killed |
| (vii) | Start session today resolve typed | `test:start-session-today-resolve` | ✓ Killed |
| (viii) | Post-swap DOM preselection | `test:rest-day-swap-preselect-dom` | ✓ Killed |

## Lint & Type Safety
- **Lint**: 55 warnings (matches main `831e2cb1` baseline exactly, no new warnings)
- **TypeCheck**: Clean, no errors

## Files Changed

### Rest-Day & Collision Lane (Core Changes)
- `src/lib/program/persist.ts` - Added `decideBlockStartedOn()` helper, block-1 anchoring
- `src/lib/program/day-plan.ts` - Exported `resolveTodayProgramDayCore()` pure helper
- `src/lib/today/load-today-plan.ts` - Added `loadTodayPlan()` shared loader
- `src/lib/today/next-day-plan-core.ts` - Extracted `nextDayPlanCore()` pure helper
- `src/lib/session/start-session-full-core.ts` - Added `startSessionFullCore()` with DI
- `src/lib/session/start-session-full-deps.ts` - Added `buildStartSessionFullDeps()` and interfaces
- `src/app/today/page.tsx` - Removed post-swap collision resolution inline logic, now uses `loadTodayPlan()`
- `src/app/today/actions.ts` - Removed `startTomorrow` action, cleaned imports (whitespace-only edits)
- `src/lib/dates.ts` - Removed unused `localHour` helper
- `src/components/day-plan-prompt.tsx` - Uses `nextDayPlanCore()` for preview
- `src/app/session/actions.ts` - Uses `startSessionFullCore()` for session start

### Test Scripts (13 new)
- `scripts/test-anchored-indices.ts`
- `scripts/test-new-plan-behavior.ts`
- `scripts/test-rest-day-swap-preselect-dom.tsx`
- `scripts/test-post-swap-collision.ts`
- `scripts/test-existing-plan-schedule-unchanged.ts`
- `scripts/test-today-plan-loader.ts`
- `scripts/test-next-day-plan-core.ts`
- `scripts/test-start-session-today-resolve.ts`
- `scripts/test-start-session-full-core-collision.ts`
- `scripts/test-start-session-full-deps-resolve.ts`
- `scripts/test-started-on-decision.ts`
- `scripts/test-started-on-mutant-a.ts`
- `scripts/test-started-on-mutant-b.ts`

### Build Config
- `package.json` - Added 13 new test entries (chain: 468 = 455 main + 13)

### Cross-Lane Edits (Minimal)
- `src/app/dev/session/preview.tsx` - Import path update for types
- `src/lib/program/generate.ts` - No changes (generator remains block-agnostic)
- `src/lib/program/splits.ts` - No changes (day indices unchanged)
- `src/lib/program/rollover.ts` - No changes (rollover RPC unchanged)

## Base Branch
Rebased on main `831e2cb107ce7187365644f86ad111e803e1877f` (#160 gym domains).

## Known Limitation
New user's anchored block 1 snaps back to standard weekday pattern on Settings rebuild and at rollover to block 2. Follow-up PR will carry forward the anchor across rebuilds and rollover.
