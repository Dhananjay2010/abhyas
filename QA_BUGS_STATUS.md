# QA Bugs Fix Plan - Comprehensive Status

## COMPLETED
### (f) Block rollover header display
- **Root cause**: After rollover, re-read query used `.eq("status", "active")` instead of the specific program ID
- **Fix**: Changed to `.eq("id", rollover.programId).single()` 
- **Test**: scripts/test-rollover-display.ts ✅
- **Files**: src/app/today/page.tsx

### (e) Focus trap for sheets - PARTIAL
- **Completed**: 
  - Created src/lib/focus-trap.ts utility
  - Fixed PrefsSheet (breathe/prefs-sheet.tsx)
  - Fixed pause dialog (breathe/[slug]/session/breathing-session.tsx)
- **Remaining**: Need to test thoroughly

## IN PROGRESS / TODO

### HIGH PRIORITY

#### g2: Session ended early shows as 'Skipped' with no sets
- **Root cause**: `abandonSession` always sets status='skipped' without checking for logged sets
- **Fix needed**: Check if working sets exist, use 'completed' if they do
- **Related to**: (d) session duration
- **Files**: src/app/session/actions.ts (abandonSession function)

#### g3: Duration is wrong (part of d)
- **Root cause**: finishSession takes elapsed time from current attempt only, doesn't accumulate
- **Fix needed**: Track total active time across all attempts/resumes
- **Approach**: Either:
  1. Add `accumulated_seconds` column to sessions table
  2. Calculate on finish by: (completed_at - started_at) - (pause time)
- **Files**: src/app/session/actions.ts, possibly migration

#### g1: Missed-yesterday prompt comes back
- **Root cause**: DayPlanPrompt uses local state that doesn't persist across navigation
- **Fix needed**: Check for existing override in database, don't show if already answered
- **Files**: src/components/day-plan-prompt.tsx, src/app/today/page.tsx

#### g4: Streak stays at 0
- **Need to investigate**: Check if this is by design or a bug
- **Files**: src/lib/progress/streaks.ts, SPEC.md section on streaks

### MEDIUM PRIORITY

#### g5: Header vs Your week inconsistency (relates to c)
- **Root cause**: Similar to override handling
- **Files**: src/app/today/page.tsx

#### g6: End session early / Exit need confirmation
- **Fix needed**: Add confirmation dialog with focus trap
- **Files**: src/app/session/[id]/session-runner.tsx

#### g7: Keep it / swap are slow - need optimistic UI
- **Fix needed**: Update UI immediately, rollback on error
- **Files**: src/components/day-plan-prompt.tsx

### LOW PRIORITY

#### g8: Progression copy confusing
- **Fix**: Just rewrite text, no logic change
- **Current**: "Staying here until every set reaches the top of the range"
- **Better**: "Keep this weight until you complete all sets at 12 reps"
- **Files**: Wherever progression messages are shown

### ORIGINAL ITEMS

#### (a) Breathe tab error handling
- **Fix needed**: Wrap queries in try-catch, show section-level fallbacks
- **Files**: src/app/breathe/page.tsx

#### (b) Tomorrow choice persistence after reload
- **Root cause**: Likely same as g1 - state not persisting
- **Files**: src/components/day-plan-prompt.tsx

#### (c) Your week doesn't mark completed days  
- **Fix needed**: Add completed status to week display
- **Files**: src/app/today/page.tsx

#### (d) Session duration only counts last attempt
- **Same as g3** - needs accumulated time tracking

## MIGRATION NEEDED
If we add `accumulated_seconds` for g3/d:
```sql
ALTER TABLE sessions ADD COLUMN accumulated_seconds integer;
COMMENT ON COLUMN sessions.accumulated_seconds IS 
  'Total active training time across all attempts/resumes of this session, in seconds';
```

## TESTING REQUIREMENTS
- npm run build
- npm run lint  
- npx tsc --noEmit
- npm test
- Manual testing of each fix

## CONSTRAINTS
- Don't touch generate.ts
- Don't touch rest-day block in today/page.tsx
- Don't touch settings logic  
- Minimal edits to today/page.tsx
- Note conflicts with PR #1
- New migrations only (no altering existing)
