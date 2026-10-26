#!/bin/bash
set -e

echo "=== History empty states mutant testing ==="

# Trap to restore files on exit
cleanup() {
  if [ -f /tmp/empty-state.ts.bak ]; then
    cp /tmp/empty-state.ts.bak src/lib/history/empty-state.ts
  fi
  if [ -f /tmp/history-client.tsx.bak ]; then
    cp /tmp/history-client.tsx.bak src/app/history/history-client.tsx
  fi
}
trap cleanup EXIT INT TERM

# Baseline: tests must pass
echo "Running baseline check..."
if ! npm run test:history-empty-states > /tmp/baseline.log 2>&1; then
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
    if npm run test:history-empty-states > /tmp/mutant.log 2>&1; then
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

# Mutant 1: Force not-empty
cp src/lib/history/empty-state.ts /tmp/empty-state.ts.bak
test_mutant 1 "return total === 0 ? 'true-empty' → 'filtered-empty'" \
  "src/lib/history/empty-state.ts" \
  'return total === 0 ? "true-empty" : "filtered-empty";' \
  'return total === 0 ? "filtered-empty" : "filtered-empty";'

# Mutant 2: Invert condition
test_mutant 2 "total === 0 → total !== 0" \
  "src/lib/history/empty-state.ts" \
  'total === 0' \
  'total !== 0'

# Mutant 3: Drop CTA href
cp src/app/history/history-client.tsx /tmp/history-client.tsx.bak
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

# Crash self-test
echo ""
echo "Crash self-test: inject syntax error"
cp src/lib/history/empty-state.ts /tmp/empty-state.ts.bak
echo "const = ;" >> src/lib/history/empty-state.ts
if npm run test:history-empty-states > /tmp/crash-test.log 2>&1; then
  echo "ERROR: Crash test did not fail"
  cp /tmp/empty-state.ts.bak src/lib/history/empty-state.ts
  exit 1
elif grep -qE "(Test error:|TransformError|SyntaxError)" /tmp/crash-test.log && ! grep -q "FAIL" /tmp/crash-test.log; then
  echo "✓ Crash self-test passed (reported as ERROR, not FAIL)"
else
  echo "ERROR: Crash test produced unexpected output"
  cat /tmp/crash-test.log
  cp /tmp/empty-state.ts.bak src/lib/history/empty-state.ts
  exit 1
fi
cp /tmp/empty-state.ts.bak src/lib/history/empty-state.ts

echo ""
echo "=== All mutants killed ==="
