#!/bin/bash
set -e

echo "=== History empty states mutant testing ==="

# Create temporary workspace
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# Backup files
cp src/lib/history/empty-state.ts "$work/empty-state.ts.bak"
cp src/app/history/history-client.tsx "$work/history-client.tsx.bak"

# Restore function
restore() {
  [ -f "$work/empty-state.ts.bak" ] && cp "$work/empty-state.ts.bak" src/lib/history/empty-state.ts
  [ -f "$work/history-client.tsx.bak" ] && cp "$work/history-client.tsx.bak" src/app/history/history-client.tsx
}

# Baseline: tests must pass
echo "Running baseline check..."
if ! npm run test:history-empty-states > "$work/baseline.log" 2>&1; then
  echo "ERROR: Baseline tests failed"
  cat "$work/baseline.log"
  exit 1
fi
if ! npm run test:history-page-counts >> "$work/baseline.log" 2>&1; then
  echo "ERROR: Baseline page-counts test failed"
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
  if npm run test:history-empty-states > "$work/mutant.log" 2>&1 && \
     npm run test:history-page-counts >> "$work/mutant.log" 2>&1; then
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

# Mutant 1: Force not-empty
test_mutant 1 "return total === 0 ? 'true-empty' → 'filtered-empty'" \
  "src/lib/history/empty-state.ts" \
  'return total === 0 ? "true-empty" : "filtered-empty";' \
  'return total === 0 ? "filtered-empty" : "filtered-empty";'

# Mutant 2: Invert condition
test_mutant 2 "total === 0 → total !== 0" \
  "src/lib/history/empty-state.ts" \
  'return total === 0 ? "true-empty" : "filtered-empty";' \
  'return total !== 0 ? "true-empty" : "filtered-empty";'

# Mutant 3: Drop CTA href
test_mutant 3 'Drop CTA href: href="/today" → href="/"' \
  "src/app/history/history-client.tsx" \
  'href="/today"' \
  'href="/"'

# Mutant 4: Clear filters target
test_mutant 4 'Clear filters: params.set("filter", target) → params.delete("filter")' \
  "src/app/history/history-client.tsx" \
  'params.set("filter", target);' \
  'params.delete("filter");'

# Mutant 5: Error branch removed
test_mutant 5 'if (hasErrors) return "error"; deleted' \
  "src/lib/history/empty-state.ts" \
  'if (hasErrors) return "error";' \
  '// if (hasErrors) return "error";'

# Mutant 6: p_filter changed to filter (kills history-page-counts H1)
test_mutant 6 'p_filter: f → filter (page.tsx count fetch)' \
  "src/app/history/page.tsx" \
  'p_filter: f,' \
  'filter,'

# Mutant 7: countsError forced to false
test_mutant 7 'countsError forced to false' \
  "src/app/history/page.tsx" \
  'const countsError = countRes.some(r => r.error);' \
  'const countsError = false;'

# Mutant 8: Count parse forced to 0
test_mutant 8 'Count parse result forced to 0' \
  "src/app/history/page.tsx" \
  'Number((countRes[i].data as { total_count: number }[] | null)?.[0]?.total_count ?? 0)' \
  '0'

# Crash self-test
echo ""
echo "Crash self-test: inject syntax error"
cp src/lib/history/empty-state.ts "$work/crash-test.bak"
echo "const = ;" >> src/lib/history/empty-state.ts
if npm run test:history-empty-states > "$work/crash-test.log" 2>&1; then
  echo "ERROR: Crash test did not fail"
  cp "$work/crash-test.bak" src/lib/history/empty-state.ts
  exit 1
elif grep -qE "(Test error:|TransformError|SyntaxError)" "$work/crash-test.log" && ! grep -q "FAIL" "$work/crash-test.log"; then
  echo "✓ Crash self-test passed (reported as ERROR, not FAIL)"
else
  echo "ERROR: Crash test produced unexpected output"
  cat "$work/crash-test.log"
  cp "$work/crash-test.bak" src/lib/history/empty-state.ts
  exit 1
fi
cp "$work/crash-test.bak" src/lib/history/empty-state.ts

echo ""
echo "=== All history mutants killed ==="
