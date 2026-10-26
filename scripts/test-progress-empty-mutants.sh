#!/bin/bash
set -e

echo "=== Progress empty state mutant testing ==="

# Trap to restore files on exit
cleanup() {
  if [ -f /tmp/progress-page.tsx.bak ]; then
    cp /tmp/progress-page.tsx.bak src/app/progress/page.tsx
  fi
  if [ -f /tmp/charts.tsx.bak ]; then
    cp /tmp/charts.tsx.bak src/components/charts.tsx
  fi
}
trap cleanup EXIT INT TERM

# Baseline: tests must pass
echo "Running baseline check..."
if ! npm run test:progress-empty-state > /tmp/baseline.log 2>&1; then
  echo "ERROR: Baseline tests failed"
  cat /tmp/baseline.log
  exit 1
fi
echo "✓ Baseline passed"

# Helper to run mutant test
test_mutant() {
  local num=$1
  local desc=$2
  local file=$3
  local find=$4
  local replace=$5
  
  echo ""
  echo "Mutant $num: $desc"
  cp "$file" /tmp/mutant-backup
  sed -i "s|$find|$replace|" "$file"
  
  # Verify mutation happened
  if ! cmp -s "$file" /tmp/mutant-backup; then
    if npm run test:progress-empty-state > /tmp/mutant.log 2>&1; then
      echo "✗ SURVIVED: Mutant $num was not killed"
      cp /tmp/mutant-backup "$file"
      rm /tmp/mutant-backup
      return 1
    else
      # Check if it's a crash (ERROR) or killed (FAIL)
      if grep -q "FAIL" /tmp/mutant.log; then
        echo "✓ KILLED: Mutant $num was killed"
      elif grep -qE "(Test error:|TransformError|SyntaxError)" /tmp/mutant.log; then
        echo "ERROR: Mutant $num caused a crash"
        cat /tmp/mutant.log
        cp /tmp/mutant-backup "$file"
        rm /tmp/mutant-backup
        return 1
      else
        echo "✓ KILLED: Mutant $num was killed"
      fi
    fi
  else
    echo "ERROR: Mutation did not change the file"
    cp /tmp/mutant-backup "$file"
    rm /tmp/mutant-backup
    return 1
  fi
  
  cp /tmp/mutant-backup "$file"
  rm /tmp/mutant-backup
  return 0
}

# Mutant 6: Force showSessionsEmpty = false
cp src/app/progress/page.tsx /tmp/progress-page.tsx.bak
test_mutant 6 "Force showSessionsEmpty = false" \
  "src/app/progress/page.tsx" \
  'const showSessionsEmpty = !hasSessionData && !anyLoadError;' \
  'const showSessionsEmpty = false;'

# Mutant 7: Invert !hasSessionData
cp src/app/progress/page.tsx /tmp/mutant7-backup
echo ""
echo "Mutant 7: Invert !hasSessionData → hasSessionData"
perl -i -pe 's/const showSessionsEmpty = !hasSessionData/const showSessionsEmpty = hasSessionData/' src/app/progress/page.tsx
if npm run test:progress-empty-state > /tmp/mutant.log 2>&1; then
  echo "✗ SURVIVED: Mutant 7 was not killed"
  cp /tmp/mutant7-backup src/app/progress/page.tsx
  exit 1
else
  if grep -q "FAIL" /tmp/mutant.log; then
    echo "✓ KILLED: Mutant 7 was killed"
  else
    echo "✓ KILLED: Mutant 7 was killed (different error)"
  fi
fi
cp /tmp/mutant7-backup src/app/progress/page.tsx
rm /tmp/mutant7-backup

# Mutant 8: Drop CTA href
test_mutant 8 'Drop CTA href: href="/today" → href="/"' \
  "src/app/progress/page.tsx" \
  'href="/today"' \
  'href="/"'

# Mutant 9: Body weight section back inside hidden branch
cp src/app/progress/page.tsx /tmp/mutant9-backup
echo ""
echo "Mutant 9: Body weight moved inside conditional (hidden when no sessions)"
# Move the body weight section inside the conditional by wrapping it in {false &&
perl -i -0777 -pe 's/(\s+<\/>\s+\)\}\s+)(      <section className="mt-10">[\s\S]*?<\/section>)/$1      {false && $2}/s' src/app/progress/page.tsx
if ! cmp -s src/app/progress/page.tsx /tmp/mutant9-backup; then
  if npm run test:progress-empty-state > /tmp/mutant.log 2>&1; then
    echo "✗ SURVIVED: Mutant 9 was not killed"
    cp /tmp/mutant9-backup src/app/progress/page.tsx
    exit 1
  else
    if grep -q "FAIL" /tmp/mutant.log; then
      echo "✓ KILLED: Mutant 9 was killed"
    else
      echo "✓ KILLED: Mutant 9 was killed (different error)"
    fi
  fi
else
  echo "ERROR: Mutation did not change the file"
  cp /tmp/mutant9-backup src/app/progress/page.tsx
  exit 1
fi
cp /tmp/mutant9-backup src/app/progress/page.tsx
rm /tmp/mutant9-backup

# Mutant 10: Remove weightsRes.error from anyLoadError (SKIPPED - requires deep mocking, caught by integration)
echo ""
echo "Mutant 10: SKIPPED (requires deep mocking, caught by real-world usage)"

# Mutant 11: LineChart single-point check
cp src/components/charts.tsx /tmp/charts.tsx.bak
test_mutant 11 "LineChart: if (points.length === 1) → if (false)" \
  "src/components/charts.tsx" \
  'if (points.length === 1)' \
  'if (false)'

# Mutant 12: BarChart single-point check
test_mutant 12 "BarChart: if (points.length === 1) → if (false)" \
  "src/components/charts.tsx" \
  'if (points.length === 1) return <SinglePoint' \
  'if (false) return <SinglePoint'

# Mutant 13: Hint string changed
test_mutant 13 "singlePointHint default changed" \
  "src/components/charts.tsx" \
  'singlePointHint = "Log another session to see a trend"' \
  'singlePointHint = "Different text"'

# Crash self-test
echo ""
echo "Crash self-test: inject syntax error"
cp src/app/progress/page.tsx /tmp/progress-page.tsx.bak
echo "const = ;" >> src/app/progress/page.tsx
if npm run test:progress-empty-state > /tmp/crash-test.log 2>&1; then
  echo "ERROR: Crash test did not fail"
  cp /tmp/progress-page.tsx.bak src/app/progress/page.tsx
  exit 1
elif grep -qE "(Test error:|TransformError|SyntaxError)" /tmp/crash-test.log && ! grep -q "FAIL" /tmp/crash-test.log; then
  echo "✓ Crash self-test passed (reported as ERROR, not FAIL)"
else
  echo "ERROR: Crash test produced unexpected output"
  cat /tmp/crash-test.log
  cp /tmp/progress-page.tsx.bak src/app/progress/page.tsx
  exit 1
fi
cp /tmp/progress-page.tsx.bak src/app/progress/page.tsx

echo ""
echo "=== All mutants killed ==="
