#!/bin/bash
set -e

echo "=== Progress empty state mutant testing ==="

# Create temporary workspace
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# Backup files
cp src/app/progress/page.tsx "$work/progress-page.tsx.bak"
cp src/components/charts.tsx "$work/charts.tsx.bak"

# Restore function
restore() {
  [ -f "$work/progress-page.tsx.bak" ] && cp "$work/progress-page.tsx.bak" src/app/progress/page.tsx
  [ -f "$work/charts.tsx.bak" ] && cp "$work/charts.tsx.bak" src/components/charts.tsx
}

# Baseline: tests must pass
echo "Running baseline check..."
if ! npm run test:progress-empty-state > "$work/baseline.log" 2>&1; then
  echo "ERROR: Baseline tests failed"
  cat "$work/baseline.log"
  exit 1
fi
echo "✓ Baseline passed"

# Helper to run mutant test with literal string replacement
test_mutant() {
  local num=$1
  local desc=$2
  local file=$3
  local find=$4
  local replace=$5
  
  echo ""
  echo "Mutant $num: $desc"
  
  # Use Python for literal string replacement
  python3 - "$file" "$find" "$replace" <<'PYEOF'
import sys
path, find, replace = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, 'r') as f:
    content = f.read()
if find not in content:
    sys.exit(2)
with open(path, 'w') as f:
    f.write(content.replace(find, replace, 1))
PYEOF
  
  local py_exit=$?
  if [ $py_exit -eq 2 ]; then
    echo "ERROR: Pattern not found in file"
    restore
    return 1
  elif [ $py_exit -ne 0 ]; then
    echo "ERROR: Python replacement failed"
    restore
    return 1
  fi
  
  # Run tests
  if npm run test:progress-empty-state > "$work/mutant.log" 2>&1; then
    echo "✗ SURVIVED: Mutant $num was not killed"
    restore
    return 1
  else
    # Check if it's a crash (ERROR) or killed (FAIL)
    if grep -q "FAIL" "$work/mutant.log"; then
      echo "✓ KILLED: Mutant $num was killed"
    elif grep -qE "(Test error:|TransformError|SyntaxError|Cannot find|Error:)" "$work/mutant.log"; then
      echo "ERROR: Mutant $num caused a crash"
      cat "$work/mutant.log"
      restore
      return 1
    else
      echo "✓ KILLED: Mutant $num was killed"
    fi
  fi
  
  restore
  return 0
}

# Mutant 6: Force showSessionsEmpty = false
test_mutant 6 "Force showSessionsEmpty = false" \
  "src/app/progress/page.tsx" \
  'const showSessionsEmpty = !hasSessionData && !anyLoadError;' \
  'const showSessionsEmpty = false;'

# Mutant 7: Invert !hasSessionData → hasSessionData
echo ""
echo "Mutant 7: Invert !hasSessionData → hasSessionData"
python3 - "src/app/progress/page.tsx" 'const showSessionsEmpty = !hasSessionData' 'const showSessionsEmpty = hasSessionData' <<'PYEOF'
import sys
path, find, replace = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, 'r') as f:
    content = f.read()
if find not in content:
    print("ERROR: Pattern not found")
    sys.exit(2)
with open(path, 'w') as f:
    f.write(content.replace(find, replace, 1))
PYEOF
if [ $? -ne 0 ]; then
  echo "ERROR: Mutation failed"
  restore
  exit 1
fi
if npm run test:progress-empty-state > "$work/mutant.log" 2>&1; then
  echo "✗ SURVIVED: Mutant 7 was not killed"
  restore
  exit 1
else
  if grep -q "FAIL" "$work/mutant.log"; then
    echo "✓ KILLED: Mutant 7 was killed"
  elif grep -qE "(Test error:|TransformError|SyntaxError|Cannot find|Error:)" "$work/mutant.log"; then
    echo "ERROR: Mutant 7 caused a crash"
    cat "$work/mutant.log"
    restore
    exit 1
  else
    echo "✓ KILLED: Mutant 7 was killed"
  fi
fi
restore

# Mutant 8: Drop CTA href
test_mutant 8 'Drop CTA href: href="/today" → href="/"' \
  "src/app/progress/page.tsx" \
  'href="/today"' \
  'href="/"'

# Mutant 9: Body weight moved inside conditional (hidden when no sessions)
echo ""
echo "Mutant 9: Body weight moved inside conditional (hidden when no sessions)"
python3 - "src/app/progress/page.tsx" <<'PYEOF'
import sys, re
with open(sys.argv[1], 'r') as f:
    content = f.read()
# Wrap body weight section in {false &&
pattern = r'(      <\/>\s+\)\})\s+(      <section className="mt-10">\s+<h2 className="text-sm font-semibold">Body weight<\/h2>[\s\S]*?<\/section>)'
if not re.search(pattern, content):
    print("ERROR: Pattern not found")
    sys.exit(2)
content = re.sub(pattern, r'\1\n      {false && \2}', content, count=1)
with open(sys.argv[1], 'w') as f:
    f.write(content)
PYEOF
if [ $? -ne 0 ]; then
  echo "ERROR: Mutation failed"
  restore
  exit 1
fi
if npm run test:progress-empty-state > "$work/mutant.log" 2>&1; then
  echo "✗ SURVIVED: Mutant 9 was not killed"
  restore
  exit 1
else
  if grep -q "FAIL" "$work/mutant.log"; then
    echo "✓ KILLED: Mutant 9 was killed"
  elif grep -qE "(Test error:|TransformError|SyntaxError|Cannot find|Error:)" "$work/mutant.log"; then
    echo "ERROR: Mutant 9 caused a crash"
    cat "$work/mutant.log"
    restore
    exit 1
  else
    echo "✓ KILLED: Mutant 9 was killed"
  fi
fi
restore

# Mutant 10: Remove !!weightsRes.error from anyLoadError (NOW KILLABLE)
test_mutant 10 "Remove !!weightsRes.error from anyLoadError" \
  "src/app/progress/page.tsx" \
  '|| !!weightsRes.error' \
  ''

# Mutant 11: Remove LogWeight component
test_mutant 11 "Remove LogWeight component" \
  "src/app/progress/page.tsx" \
  '<LogWeight current={latestWeight} />' \
  '{ /* LogWeight removed */ }'

# Mutant 12: Banner condition reverted
test_mutant 12 "Banner condition reverted to old condition" \
  "src/app/progress/page.tsx" \
  '{anyLoadError && (' \
  '{(progressQueryFailed || setCountsError || yogaStatsError) && ('

# Mutant 13: Remove volumeRes.error
test_mutant 13 "Remove !!volumeRes.error from anyLoadError" \
  "src/app/progress/page.tsx" \
  '|| !!volumeRes.error' \
  ''

# Mutant 14: Remove strengthRes.error
test_mutant 14 "Remove !!strengthRes.error from anyLoadError" \
  "src/app/progress/page.tsx" \
  '|| !!strengthRes.error' \
  ''

# Mutant 15: Weight error branch forced to false
test_mutant 15 "Weight error branch: weightsRes.error ? → false ?" \
  "src/app/progress/page.tsx" \
  '{weightsRes.error ? (' \
  '{false ? ('

# Mutant 16: LineChart single-point check
test_mutant 16 "LineChart: if (points.length === 1) → if (false)" \
  "src/components/charts.tsx" \
  'if (points.length === 1) return <SinglePoint' \
  'if (false) return <SinglePoint'

# Mutant 17: BarChart single-point check
test_mutant 17 "BarChart: if (points.length === 1) → if (false)" \
  "src/components/charts.tsx" \
  'if (points.length === 1) return <SinglePoint' \
  'if (false) return <SinglePoint'

# Mutant 18: singlePointHint default changed
test_mutant 18 "singlePointHint default changed" \
  "src/components/charts.tsx" \
  'singlePointHint = "Log another session to see a trend"' \
  'singlePointHint = "Different text"'

# Crash self-test
echo ""
echo "Crash self-test: inject syntax error"
cp src/app/progress/page.tsx "$work/crash-test.bak"
echo "const = ;" >> src/app/progress/page.tsx
if npm run test:progress-empty-state > "$work/crash-test.log" 2>&1; then
  echo "ERROR: Crash test did not fail"
  cp "$work/crash-test.bak" src/app/progress/page.tsx
  exit 1
elif grep -qE "(Test error:|TransformError|SyntaxError)" "$work/crash-test.log" && ! grep -q "FAIL" "$work/crash-test.log"; then
  echo "✓ Crash self-test passed (reported as ERROR, not FAIL)"
else
  echo "ERROR: Crash test produced unexpected output"
  cat "$work/crash-test.log"
  cp "$work/crash-test.bak" src/app/progress/page.tsx
  exit 1
fi
cp "$work/crash-test.bak" src/app/progress/page.tsx

echo ""
echo "=== All progress mutants killed ==="
