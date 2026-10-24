#!/bin/bash
# Script to create proofs for all 9 breaks by breaking production code,
# running tests, and recording which tests catch the breaks.

set -e

RESULTS_FILE="/workspace/proof-results.txt"
> "$RESULTS_FILE"

echo "Creating proofs for 9 breaks..." | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# Break 1: nextSetNumberFor ignores pending
echo "=== Break 1: nextSetNumberFor ignores pending ===" | tee -a "$RESULTS_FILE"
sed -i 's/return setsDone + pendingSetsForExercise + 1;/return setsDone + 1;/' src/lib/session/next-set-number.ts
if npm test 2>&1 | grep -A5 "test:next-set-number\|test:replay-plus-next-set" | tee -a "$RESULTS_FILE"; then
    echo "Break 1: Some tests may have passed (checking output)" | tee -a "$RESULTS_FILE"
else
    echo "Break 1: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/lib/session/next-set-number.ts
echo "" | tee -a "$RESULTS_FILE"

# Break 2: canReplayForStatus always returns true
echo "=== Break 2: Replay into ended session allowed ===" | tee -a "$RESULTS_FILE"
sed -i 's/return sessionStatus === "in_progress";/return true;/' src/lib/session/pending-set-controller.ts
if npm run test:pending-set-controller 2>&1 | tee -a "$RESULTS_FILE"; then
    echo "Break 2: Tests passed unexpectedly!" | tee -a "$RESULTS_FILE"
else
    echo "Break 2: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/lib/session/pending-set-controller.ts
echo "" | tee -a "$RESULTS_FILE"

# Break 3: storageKey not per-user
echo "=== Break 3: Storage key not per-user ===" | tee -a "$RESULTS_FILE"
sed -i 's/return `pending-sets:\${userId}`;/return "pending-sets";/' src/lib/session/pending-set-retry.ts
if npm run test:pending-set-user-isolation 2>&1 | tee -a "$RESULTS_FILE"; then
    echo "Break 3: Tests passed unexpectedly!" | tee -a "$RESULTS_FILE"
else
    echo "Break 3: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/lib/session/pending-set-retry.ts
echo "" | tee -a "$RESULTS_FILE"

# Break 4: No clear on sign-out
echo "=== Break 4: Sign-out doesn't clear pending sets ===" | tee -a "$RESULTS_FILE"
sed -i 's/clearAllPendingSetsForUser(window.localStorage, userId);/\/\/ clearAllPendingSetsForUser(window.localStorage, userId);/' src/app/settings/signout-button.tsx
if npm run test:pending-set-signout-clear 2>&1 | tee -a "$RESULTS_FILE"; then
    echo "Break 4: Tests passed unexpectedly!" | tee -a "$RESULTS_FILE"
else
    echo "Break 4: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/app/settings/signout-button.tsx
echo "" | tee -a "$RESULTS_FILE"

# Break 5: set_exists treated as failure
echo "=== Break 5: set_exists treated as failure ===" | tee -a "$RESULTS_FILE"
sed -i 's/if ("reason" in result && result.reason === "set_exists") {/if (false \&\& "reason" in result \&\& result.reason === "set_exists") {/' src/lib/session/pending-set-controller.ts
if npm run test:pending-set-retry 2>&1 | tee -a "$RESULTS_FILE"; then
    echo "Break 5: Tests passed unexpectedly!" | tee -a "$RESULTS_FILE"
else
    echo "Break 5: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/lib/session/pending-set-controller.ts
echo "" | tee -a "$RESULTS_FILE"

# Break 6: safeNextPath allows '//evil.com'
echo "=== Break 6: safeNextPath allows //evil.com ===" | tee -a "$RESULTS_FILE"
sed -i 's/if (!next.startsWith.*\/\/.*startsWith.*\\\\.*) {/if (!next.startsWith("\/")) {/' src/lib/safe-next-path.ts
if npm run test:safe-next-path-validation 2>&1 | tee -a "$RESULTS_FILE"; then
    echo "Break 6: Tests passed unexpectedly!" | tee -a "$RESULTS_FILE"
else
    echo "Break 6: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/lib/safe-next-path.ts
echo "" | tee -a "$RESULTS_FILE"

# Break 7: Replay error shown as session expired
echo "=== Break 7: Replay error shown as session expired ===" | tee -a "$RESULTS_FILE"
sed -i 's/{pendingSetState.error ? (/{false \&\& pendingSetState.error ? (/' src/app/session/\[id\]/session-runner.tsx
if npm run test:pending-set-ui-states 2>&1 | tee -a "$RESULTS_FILE"; then
    echo "Break 7: Tests passed unexpectedly!" | tee -a "$RESULTS_FILE"
else
    echo "Break 7: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/app/session/\[id\]/session-runner.tsx
echo "" | tee -a "$RESULTS_FILE"

# Break 8: Auto-retry on focus removed
echo "=== Break 8: Auto-retry on focus removed ===" | tee -a "$RESULTS_FILE"
sed -i 's/replay();/\/\/ replay();/' src/lib/session/pending-set-controller.ts
if npm run test:auto-replay-on-mount 2>&1 | tee -a "$RESULTS_FILE"; then
    echo "Break 8: Tests passed unexpectedly!" | tee -a "$RESULTS_FILE"
else
    echo "Break 8: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/lib/session/pending-set-controller.ts
echo "" | tee -a "$RESULTS_FILE"

# Break 9: Finish allowed while pending
echo "=== Break 9: Finish button enabled while pending ===" | tee -a "$RESULTS_FILE"
sed -i 's/return busy || pendingCount > 0;/return busy;/' src/lib/session/finish-guard.ts
if npm run test:session-finish-guard 2>&1 | tee -a "$RESULTS_FILE"; then
    echo "Break 9: Tests passed unexpectedly!" | tee -a "$RESULTS_FILE"
else
    echo "Break 9: Tests failed as expected" | tee -a "$RESULTS_FILE"
fi
git checkout src/lib/session/finish-guard.ts
echo "" | tee -a "$RESULTS_FILE"

echo "" | tee -a "$RESULTS_FILE"
echo "=== Proof creation complete ===" | tee -a "$RESULTS_FILE"
echo "Results saved to $RESULTS_FILE"
