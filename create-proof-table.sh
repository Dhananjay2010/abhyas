#!/bin/bash
# Create proof table for all 9 breaks
set -e

PROOF_FILE="/workspace/proof-table.txt"
> "$PROOF_FILE"

echo "Creating proof table..." | tee -a "$PROOF_FILE"
echo "" | tee -a "$PROOF_FILE"

# Break 1: nextSetNumberFor ignores pending
echo "=== Break 1: nextSetNumberFor ignores pending ===" | tee -a "$PROOF_FILE"
echo "File: src/lib/session/next-set-number.ts:13" | tee -a "$PROOF_FILE"
sed -i.bak 's/return setsDone + pendingSetsForExercise + 1;/return setsDone + 1;/' src/lib/session/next-set-number.ts
npm run test:next-set-number 2>&1 | grep -E "❌|Expected.*got" | head -3 | tee -a "$PROOF_FILE"
echo "Failing test: test:next-set-number" | tee -a "$PROOF_FILE"
mv src/lib/session/next-set-number.ts.bak src/lib/session/next-set-number.ts
echo "" | tee -a "$PROOF_FILE"

# Break 2: canReplayForStatus always true  
echo "=== Break 2: Replay into ended session ===" | tee -a "$PROOF_FILE"
echo "File: src/lib/session/pending-set-controller.ts:34" | tee -a "$PROOF_FILE"
sed -i.bak 's/return sessionStatus === "in_progress";/return true;/' src/lib/session/pending-set-controller.ts
npm run test:pending-set-controller 2>&1 | grep -E "❌.*Cannot replay" | head -1 | tee -a "$PROOF_FILE"
echo "Failing test: test:pending-set-controller" | tee -a "$PROOF_FILE"
mv src/lib/session/pending-set-controller.ts.bak src/lib/session/pending-set-controller.ts
echo "" | tee -a "$PROOF_FILE"

# Break 3: storageKey not per-user
echo "=== Break 3: Storage key not per-user ===" | tee -a "$PROOF_FILE"
echo "File: src/lib/session/pending-set-retry.ts:53" | tee -a "$PROOF_FILE"
sed -i.bak 's/return `pending-sets:\${userId}`;/return "pending-sets";/' src/lib/session/pending-set-retry.ts
npm run test:pending-set-user-isolation 2>&1 | grep -E "❌.*different keys|User B cannot" | head -1 | tee -a "$PROOF_FILE"
echo "Failing test: test:pending-set-user-isolation" | tee -a "$PROOF_FILE"
mv src/lib/session/pending-set-retry.ts.bak src/lib/session/pending-set-retry.ts
echo "" | tee -a "$PROOF_FILE"

# Break 4: clearAllPendingSetsForUser doesn't clear
echo "=== Break 4: Sign-out doesn't clear ===" | tee -a "$PROOF_FILE"
echo "File: src/lib/session/pending-set-retry.ts:281" | tee -a "$PROOF_FILE"
sed -i.bak 's/storage.removeItem(storageKey(userId));/\/\/ storage.removeItem(storageKey(userId));/' src/lib/session/pending-set-retry.ts
npm run test:pending-set-signout-clear 2>&1 | grep -E "❌.*cleared after" | head -1 | tee -a "$PROOF_FILE"
echo "Failing test: test:pending-set-signout-clear" | tee -a "$PROOF_FILE"
mv src/lib/session/pending-set-retry.ts.bak src/lib/session/pending-set-retry.ts
echo "" | tee -a "$PROOF_FILE"

# Break 5: set_exists treated as failure
echo "=== Break 5: set_exists treated as failure ===" | tee -a "$PROOF_FILE"
echo "File: src/lib/session/pending-set-controller.ts:159" | tee -a "$PROOF_FILE"
sed -i.bak 's/if ("reason" in result && result.reason === "set_exists") {/if (false \&\& "reason" in result \&\& result.reason === "set_exists") {/' src/lib/session/pending-set-controller.ts
npm run test:set-exists-replay 2>&1 | grep -E "❌.*cleared after" | head -1 | tee -a "$PROOF_FILE"
echo "Failing test: test:set-exists-replay" | tee -a "$PROOF_FILE"
mv src/lib/session/pending-set-controller.ts.bak src/lib/session/pending-set-controller.ts
echo "" | tee -a "$PROOF_FILE"

# Break 6: safeNextPath allows //
echo "=== Break 6: safeNextPath allows //evil.com ===" | tee -a "$PROOF_FILE"
echo "File: src/lib/safe-next-path.ts:26" | tee -a "$PROOF_FILE"
sed -i.bak "s/if (!next.startsWith('\/') || next.startsWith('\/\/') || next.startsWith('\/\\\\\\\\')) {/if (!next.startsWith('\/') || next.startsWith('\/\\\\\\\\')) {/" src/lib/safe-next-path.ts
npm run test:safe-next-path-validation 2>&1 | grep -E "❌.*Rejects '//'" | head -1 | tee -a "$PROOF_FILE"
echo "Failing test: test:safe-next-path-validation" | tee -a "$PROOF_FILE"
mv src/lib/safe-next-path.ts.bak src/lib/safe-next-path.ts
echo "" | tee -a "$PROOF_FILE"

# Break 7: getPendingUiMode returns wrong mode
echo "=== Break 7: Replay error shown as expired ===" | tee -a "$PROOF_FILE"
echo "File: src/lib/session/pending-ui-state.ts:20" | tee -a "$PROOF_FILE"
sed -i.bak 's/if (state.error) {/if (false \&\& state.error) {/' src/lib/session/pending-ui-state.ts
npm run test:pending-ui-state-helper 2>&1 | grep -E "❌.*replay-error" | head -1 | tee -a "$PROOF_FILE"
echo "Failing test: test:pending-ui-state-helper" | tee -a "$PROOF_FILE"
mv src/lib/session/pending-ui-state.ts.bak src/lib/session/pending-ui-state.ts
echo "" | tee -a "$PROOF_FILE"

# Break 9: isFinishDisabled ignores pending
echo "=== Break 9: Finish allowed while pending ===" | tee -a "$PROOF_FILE"
echo "File: src/lib/session/finish-guard.ts:18" | tee -a "$PROOF_FILE"
sed -i.bak 's/return busy || pendingCount > 0;/return busy;/' src/lib/session/finish-guard.ts
npm run test:session-finish-guard 2>&1 | grep -E "❌.*disabled when 1 pending" | head -1 | tee -a "$PROOF_FILE"
echo "Failing test: test:session-finish-guard" | tee -a "$PROOF_FILE"
mv src/lib/session/finish-guard.ts.bak src/lib/session/finish-guard.ts
echo "" | tee -a "$PROOF_FILE"

echo "Proof table complete. See $PROOF_FILE"
cat "$PROOF_FILE"
