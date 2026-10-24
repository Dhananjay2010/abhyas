# QA Bugs Implementation Plan - PR #6

## COMPLETED ✅
1. Merged origin/main 
2. Created shared training-days module with h3 rule (Strength + Yoga count, Breathe doesn't)
3. Updated session/actions.ts to use shared module

## IN PROGRESS - CRITICAL PATH
### Phase 1: Core Infrastructure (Blocks other items)
- [ ] h1: Server-side streak aggregation (not just higher limits)
- [ ] Update SPEC.md with h3 decision
- [ ] i2: Use shared streak module everywhere (Progress, Today, History, Breathe)
- [ ] Add unit tests for training-days module

### Phase 2: Session Management
- [ ] g2 follow-up: Add partial_completion flag migration (20261024200000)
- [ ] i3: Fix Resume=off orphaning sessions
- [ ] g6: End session/Exit confirmation with focus trap

### Phase 3: UI/UX Improvements  
- [ ] i1: History sort newest-first, show dates/times, show "Partial"
- [ ] (c)+g5: Mark completed days in Your week
- [ ] (b)+g1: Persist tomorrow/missed-yesterday choice
- [ ] g7: Optimistic UI for Keep it/swap
- [ ] h6: Shared duration formatter
- [ ] i5: Yoga "I did this" optimistic + investigate slow save

### Phase 4: Breathe & Accessibility
- [ ] (a): Per-section error handling on Breathe page
- [ ] (e) remaining: Focus traps on handoff/mood/ending sheets
- [ ] h4: Breathe resume or restart message
- [ ] h5: Back leaves Breathe
- [ ] h7: Persist Yoga day choice
- [ ] i6: Fix small tap targets (<44px)
- [ ] i7: Breathe button accessible names
- [ ] i8: Breathe chip wrapping at 390px
- [ ] i9: Yoga history detail (show video/series day)

### Phase 5: Settings & Polish
- [ ] i4: Session length Settings prompt + "Rebuild now"
- [ ] g8: Progression copy using actual range top
- [ ] i10: Re-enable zoom (remove maximum-scale=1)
- [ ] h2 follow-up: Retry button + offline queue

### Phase 6: Testing & Documentation
- [ ] Add comprehensive tests for all fixes
- [ ] Remove QA_BUGS_STATUS.md
- [ ] Write root-cause analysis for i4 (60/75 min identical plans)
- [ ] Update PR description with accurate final status
- [ ] Run all checks: build, lint, tsc, npm test

## ROOT CAUSE INVESTIGATIONS NEEDED
- i4: Why do 60 and 75 min produce identical plans?
- i5: Why is Yoga save slow?
