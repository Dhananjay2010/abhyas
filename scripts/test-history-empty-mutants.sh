#!/bin/bash
# Mutants for the History empty states (PR #153). Each mutant is applied alone, tested, then reverted.
set -u
cd "$(dirname "$0")/.."
# shellcheck source=scripts/empty-state-mutant-lib.sh
. scripts/empty-state-mutant-lib.sh

echo "=== History empty states mutant testing ==="
mutant_init test:history-empty-states test:history-page-counts -- \
  src/lib/history/empty-state.ts src/app/history/history-client.tsx src/app/history/page.tsx
run_baseline

E=src/lib/history/empty-state.ts; C=src/app/history/history-client.tsx; P=src/app/history/page.tsx
test_mutant 1 "total === 0 ? true-empty -> always filtered-empty" literal "$E" \
  'return total === 0 ? "true-empty" : "filtered-empty";' 'return total === 0 ? "filtered-empty" : "filtered-empty";'
test_mutant 2 "total === 0 -> total !== 0" literal "$E" \
  'return total === 0 ? "true-empty" : "filtered-empty";' 'return total !== 0 ? "true-empty" : "filtered-empty";'
test_mutant 3 'CTA href="/today" -> href="/"' literal "$C" 'href="/today"' 'href="/"'
test_mutant 4 'Clear filters: params.set("filter", target) -> params.delete("filter")' literal "$C" \
  'params.set("filter", target);' 'params.delete("filter");'
test_mutant 5 'error branch deleted' literal "$E" 'if (hasErrors) return "error";' '// if (hasErrors) return "error";'
test_mutant 6 'page.tsx count fetch: p_filter: f -> p_filter: filter' literal "$P" 'p_filter: f,' 'p_filter: filter,'
test_mutant 7 'page.tsx countsError forced to false' literal "$P" \
  'const countsError = countRes.some(r => r.error);' 'const countsError = false;'
test_mutant 8 'page.tsx count parse forced to 0' literal "$P" \
  'Number((countRes[i].data as { total_count: number }[] | null)?.[0]?.total_count ?? 0)' '0'

crash_self_test "$E" 'if (hasErrors) return "error";'
mutant_summary
