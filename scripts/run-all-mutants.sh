#!/usr/bin/env bash
# Run all 13 mutants one by one

set -e

echo "Running mutant tests..."
echo ""

# X1: Comment out repoint call in first build
echo "=== X1: persist.ts:197 (repoint call in first build) ==="
cp src/lib/program/persist.ts src/lib/program/persist.ts.bak
sed -i '197s/^/\/\/ MUTANT: /' src/lib/program/persist.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/persist.ts.bak src/lib/program/persist.ts
echo ""

# X2: Comment out repoint call in rebuild
echo "=== X2: persist.ts:200 (repoint call in rebuild) ==="
cp src/lib/program/persist.ts src/lib/program/persist.ts.bak
sed -i '200,205s/^/\/\/ MUTANT: /' src/lib/program/persist.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/persist.ts.bak src/lib/program/persist.ts
echo ""

# X5: Remove program_id from session update
echo "=== X5: repoint-sessions.ts:299 (program_id in update) ==="
cp src/lib/program/repoint-sessions.ts src/lib/program/repoint-sessions.ts.bak
sed -i '299s/, program_id: newProgramId//' src/lib/program/repoint-sessions.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/repoint-sessions.ts.bak src/lib/program/repoint-sessions.ts
echo ""

# X7: Change has_sets condition
echo "=== X7: repoint-sessions.ts:92 (has_sets check) ==="
cp src/lib/program/repoint-sessions.ts src/lib/program/repoint-sessions.ts.bak
sed -i '92s/if (session.has_sets)/if (false)/' src/lib/program/repoint-sessions.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/repoint-sessions.ts.bak src/lib/program/repoint-sessions.ts
echo ""

# X8: Remove retired blocks
echo "=== X8: resolve-today-days.ts:39 (retired blocks) ==="
cp src/lib/resolve-today-days.ts src/lib/resolve-today-days.ts.bak
sed -i '39,44s/^/\/\/ MUTANT: /' src/lib/resolve-today-days.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/resolve-today-days.ts.bak src/lib/resolve-today-days.ts
echo ""

# X9: Remove active blocks
echo "=== X9: resolve-today-days.ts:20 (active blocks) ==="
cp src/lib/resolve-today-days.ts src/lib/resolve-today-days.ts.bak
sed -i '20,29s/^/\/\/ MUTANT: /' src/lib/resolve-today-days.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/resolve-today-days.ts.bak src/lib/resolve-today-days.ts
echo ""

# X10-X15: Deload sets reduction
echo "=== X10-X15: prescription.ts:108 (deload sets) ==="
cp src/lib/program/prescription.ts src/lib/program/prescription.ts.bak
sed -i '108s/Math.max(2, Math.round(p.sets \* 0.6))/p.sets/' src/lib/program/prescription.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/prescription.ts.bak src/lib/program/prescription.ts
echo ""

# X11: Timezone math
echo "=== X11: persist.ts:24-26 (timezone date) ==="
cp src/lib/program/persist.ts src/lib/program/persist.ts.bak
sed -i '26s/now.toLocaleDateString(.*)/new Date(now).toISOString().slice(0, 10)/' src/lib/program/persist.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/persist.ts.bak src/lib/program/persist.ts
echo ""

# X16: First day flag
echo "=== X16: resolve-today-days.ts:55 (is_first_day_of_block) ==="
cp src/lib/resolve-today-days.ts src/lib/resolve-today-days.ts.bak
sed -i '55s/is_first_day_of_block: d.local_date === block.started_on/is_first_day_of_block: false/' src/lib/resolve-today-days.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/resolve-today-days.ts.bak src/lib/resolve-today-days.ts
echo ""

# NEW1: day_type in label match
echo "=== NEW1: repoint-sessions.ts:103 (day_type in match) ==="
cp src/lib/program/repoint-sessions.ts src/lib/program/repoint-sessions.ts.bak
sed -i '103s/d.day_type === chosenType && //' src/lib/program/repoint-sessions.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/repoint-sessions.ts.bak src/lib/program/repoint-sessions.ts
echo ""

# NEW2: index match
echo "=== NEW2: repoint-sessions.ts:106 (index match) ==="
cp src/lib/program/repoint-sessions.ts src/lib/program/repoint-sessions.ts.bak
sed -i '106,109s/^/\/\/ MUTANT: /' src/lib/program/repoint-sessions.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/repoint-sessions.ts.bak src/lib/program/repoint-sessions.ts
echo ""

# NEW3: 0-set session check
echo "=== NEW3: repoint-sessions.ts:77 (decideRepointAction) ==="
cp src/lib/program/repoint-sessions.ts src/lib/program/repoint-sessions.ts.bak
sed -i '92s/if (session.has_sets) return "keep"/if (true) return "keep"/' src/lib/program/repoint-sessions.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/repoint-sessions.ts.bak src/lib/program/repoint-sessions.ts
echo ""

# NEW4: delete old exercises
echo "=== NEW4: repoint-sessions.ts:269 (delete old session_exercises) ==="
cp src/lib/program/repoint-sessions.ts src/lib/program/repoint-sessions.ts.bak
sed -i '269,272s/^/\/\/ MUTANT: /' src/lib/program/repoint-sessions.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/repoint-sessions.ts.bak src/lib/program/repoint-sessions.ts
echo ""

# NEW5: insert new exercises
echo "=== NEW5: repoint-sessions.ts:280 (insert new session_exercises) ==="
cp src/lib/program/repoint-sessions.ts src/lib/program/repoint-sessions.ts.bak
sed -i '280,285s/^/\/\/ MUTANT: /' src/lib/program/repoint-sessions.ts
if npm test 2>&1 | grep -q "FAIL\|✗"; then
  echo "KILLED"
  echo "First failing test:"
  npm test 2>&1 | grep -m1 -A2 "FAIL\|✗" || true
else
  echo "SURVIVED"
fi
mv src/lib/program/repoint-sessions.ts.bak src/lib/program/repoint-sessions.ts
echo ""

echo "All mutants tested."
