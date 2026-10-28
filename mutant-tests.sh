#!/bin/bash
# Mutant verification for PR #169 items 1-6

cd /workspace
echo "=== MUTANT VERIFICATION ==="

# Item 1: close-stale.ts mutant (always use last set rest)
echo "Item 1: Testing stale close warmup rest mutant..."
sed -i 's/const lastSetTime = lastSetCompletedAt.get(id);/const restSeconds = lastSetRestSeconds.get(id) ?? null;/' src/lib/session/close-stale.ts
sed -i '/const lastWorkingSetTime/,/: (lastSetRestSeconds.get(id) ?? null);/d' src/lib/session/close-stale.ts
npm run test:pr169-stale-close-warmup-rest > /tmp/m1.txt 2>&1
if grep -q "Failed:" /tmp/m1.txt; then
  echo "✅ Item 1 mutant caught"
  grep -n "❌" /tmp/m1.txt | head -1
else
  echo "❌ Item 1 mutant NOT caught"
fi
git checkout src/lib/session/close-stale.ts > /dev/null 2>&1

echo ""
echo "Item 2: Testing cooldown done retry mutant..."
sed -i 's/return !succeeded;/return !succeeded \&\& !cooldownCompleted;/' src/lib/session/finish-flow.ts
npm run test:pr169-cooldown-done-retry > /tmp/m2.txt 2>&1
if grep -q "Failed:" /tmp/m2.txt; then
  echo "✅ Item 2 mutant caught"
  grep -n "❌" /tmp/m2.txt | head -1
else
  echo "❌ Item 2 mutant NOT caught"
fi
git checkout src/lib/session/finish-flow.ts > /dev/null 2>&1

echo ""
echo "Item 4: Testing history volume warmup page call mutant..."
sed -i '/\.filter((s) => !s\.is_warmup_set)/d' src/app/history/[id]/page.tsx
npm run test:pr169-history-volume-page-call > /tmp/m4.txt 2>&1
if grep -q "Failed:" /tmp/m4.txt; then
  echo "✅ Item 4 mutant caught"
  grep -n "❌" /tmp/m4.txt | head -1
else
  echo "❌ Item 4 mutant NOT caught"
fi
git checkout src/app/history/[id]/page.tsx > /dev/null 2>&1

echo ""
echo "Item 5: Testing runner finish error call mutant..."
sed -i 's/const rawError = "error" in r ? (r\.error ?? "Something went wrong") : "Failed";//' src/app/session/[id]/session-runner.tsx
sed -i 's/setError(runnerErrorMessage(new Error(rawError), .action.));/setError("error" in r ? (r.error ?? "Something went wrong") : "Failed");/' src/app/session/[id]/session-runner.tsx
npm run test:pr169-runner-finish-error-call > /tmp/m5.txt 2>&1
if grep -q "Failed:" /tmp/m5.txt; then
  echo "✅ Item 5 mutant caught"
  grep -n "❌" /tmp/m5.txt | head -1
else
  echo "❌ Item 5 mutant NOT caught"
fi
git checkout src/app/session/[id]/session-runner.tsx > /dev/null 2>&1

echo ""
echo "Item 6: Testing history duration page call mutant..."
sed -i 's/const durationText = formatDurationMinutes(durationSeconds, session\.status, session\.actual_type);/const minutes = durationSeconds !== null ? Math.round(durationSeconds \/ 60) : null;\n  const durationText = minutes !== null ? \`\$\{minutes\}m\` : "\u2014";/' src/app/history/[id]/page.tsx
npm run test:pr169-history-duration-page-call > /tmp/m6.txt 2>&1
if grep -q "Failed:" /tmp/m6.txt; then
  echo "✅ Item 6 mutant caught"
  grep -n "❌" /tmp/m6.txt | head -1
else
  echo "❌ Item 6 mutant NOT caught"
fi
git checkout src/app/history/[id]/page.tsx > /dev/null 2>&1

echo ""
echo "=== VERIFICATION COMPLETE ==="
