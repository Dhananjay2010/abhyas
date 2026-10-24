PROOF TABLE FOR SESSION EXPIRY RETRY PR #113
==============================================

Break 1: nextSetNumberFor ignores pending
File: src/lib/session/next-set-number.ts:13
Change: return setsDone + 1;  (removed + pendingSetsForExercise)
Failing test: test:next-set-number
Assertion: "Expected 4, got 3" (2 sets done, 1 pending -> should be set #4, got #3)
Caught: ✓ YES

Break 2: Replay into ended session
File: src/lib/session/pending-set-controller.ts:94 (call site)
Helper: canReplayForStatus() at line 34
Change: if (false) {  (bypassed the check)
Failing test: test:pending-set-controller  
Assertion: "logSet not called for ended session"
Caught: ✓ YES

Break 3: Storage key not per-user
File: src/lib/session/pending-set-retry.ts:53
Change: return "pending-sets";  (removed ${userId})
Failing test: test:pending-set-user-isolation
Assertion: (checking isolation...)
Caught: Need to verify

Break 4: Sign-out doesn't clear
File: src/lib/session/pending-set-retry.ts:281 (helper), src/app/settings/signout-button.tsx:13 (call site)
Helper: clearAllPendingSetsForUser()
Change: Commented out storage.removeItem()
Failing test: test:pending-set-signout-clear
Assertion: "Pending sets cleared after clearAllPendingSetsForUser"
Caught: ✓ YES

Break 5: set_exists treated as failure
File: src/lib/session/pending-set-controller.ts:159
Change: if (false && "reason"...)  (disabled the check)
Failing test: test:set-exists-replay
Assertion: (pending not cleared)
Caught: Need to verify

Break 6: safeNextPath allows //evil.com
File: src/lib/safe-next-path.ts:26
Change: (need to try)
Failing test: test:safe-next-path-validation
Assertion: "Rejects '//evil.com'"
Caught: Need to verify

Break 7: Replay error shown as expired
File: src/lib/session/pending-ui-state.ts:20 (helper), src/app/session/[id]/session-runner.tsx:857 (call site)
Helper: getPendingUiMode()
Change: (need to break call site)
Failing test: test:pending-ui-state-helper
Assertion: "Pending + error -> replay-error mode"
Caught: Need to verify

Break 8: Auto-retry on focus removed
File: (need to find call site)
Change: (need to find)
Failing test: (need to find)
Caught: Need to verify

Break 9: Finish allowed while pending
File: src/lib/session/finish-guard.ts:18 (helper), src/app/session/[id]/session-runner.tsx:520,533 (call sites)
Helper: isFinishDisabled()
Change: return busy;  (removed || pendingCount > 0)
Failing test: test:session-finish-guard
Assertion: "Button disabled when 1 pending set"
Caught: ✓ YES
