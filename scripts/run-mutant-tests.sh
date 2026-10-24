#!/usr/bin/env bash
set +e

echo "=== Mutant Testing ==="

# Mutant 1: trainAnywayOptions returns [] if !missedYesterday
echo ""
echo "Mutant 1: Re-add missed-yesterday gate"
cp src/lib/today/train-anyway.ts src/lib/today/train-anyway.ts.bak
# Insert at start of function body
sed -i '0,/): TrainAnywayDay\[\] {/s//): TrainAnywayDay[] { if (!missedYesterday) return [];/' src/lib/today/train-anyway.ts
npm run test:train-anyway >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ❌ SURVIVED"
  MUT1="survived"
else
  echo "  ✅ KILLED"
  MUT1="killed"
fi
mv src/lib/today/train-anyway.ts.bak src/lib/today/train-anyway.ts

# Mutant 2: Make upcomingDays.find return undefined
echo ""
echo "Mutant 2: Break upcoming days lookup"
cp src/lib/today/train-anyway.ts src/lib/today/train-anyway.ts.bak
# Replace the upcomingDays.find with [].find to make it always return undefined
sed -i 's/const nextTrainingDay = upcomingDays.find/const nextTrainingDay = [].find/' src/lib/today/train-anyway.ts
npm run test:train-anyway >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ❌ SURVIVED"
  MUT2="survived"
else
  echo "  ✅ KILLED"
  MUT2="killed"
fi
mv src/lib/today/train-anyway.ts.bak src/lib/today/train-anyway.ts

# Mutant 3: Always show Keep it (ignore hideKeepAndRest)
echo ""
echo "Mutant 3: Ignore hideKeepAndRest flag"
cp src/components/day-plan-prompt.tsx src/components/day-plan-prompt.tsx.bak
# Replace the hideKeepAndRest ternary branch
sed -i 's/hideKeepAndRest ? (/false ? (/' src/components/day-plan-prompt.tsx
npm run test:today-render >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ❌ SURVIVED"
  MUT3="survived"
else
  echo "  ✅ KILLED"
  MUT3="killed"
fi
mv src/components/day-plan-prompt.tsx.bak src/components/day-plan-prompt.tsx

# Mutant 4: Always show warm-up heading
echo ""
echo "Mutant 4: Ignore todayExercises.length check"
cp src/app/today/page.tsx src/app/today/page.tsx.bak
# Remove the length check
sed -i 's/todayExercises.length > 0/true/' src/app/today/page.tsx
npm run test:today-render >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ❌ SURVIVED"
  MUT4="survived"
else
  echo "  ✅ KILLED"
  MUT4="killed"
fi
mv src/app/today/page.tsx.bak src/app/today/page.tsx

# Mutant 5: Your week ignores the swap
echo ""
echo "Mutant 5: Never store swapped sessions"
cp src/app/today/page.tsx src/app/today/page.tsx.bak
# Change the comparison to always fail
sed -i 's/label !== d.label/false/' src/app/today/page.tsx
npm run test:today-render >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ❌ SURVIVED"
  MUT5="survived"
else
  echo "  ✅ KILLED"
  MUT5="killed"
fi
mv src/app/today/page.tsx.bak src/app/today/page.tsx

echo ""
echo "=== Summary ==="
echo "| Mutant | Status |"
echo "|--------|--------|"
echo "| 1. Re-add missed-yesterday gate | $MUT1 |"
echo "| 2. Return [] for upcoming | $MUT2 |"
echo "| 3. Always show Keep it | $MUT3 |"
echo "| 4. Always show warm-up heading | $MUT4 |"
echo "| 5. Your week ignores swap | $MUT5 |"
