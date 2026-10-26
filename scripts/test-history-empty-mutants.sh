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

# QA1 P1/P2 (copy and labels), each pinned to the assertion written for it
test_mutant_pinned 9 "P1: count line shown on empty states again" literal "$C" \
  '{emptyState === "populated" && (' '{true && (' 'P1 no session-count line'
test_mutant_pinned 10 "P2: button names the current tab instead of the target" literal "$C" \
  'Switch to {FILTER_LABELS[target]}' 'Switch to {FILTER_LABELS[filter]}' "P2 button labelled|P2 label is"
test_mutant_pinned 11 "P2: button count from the current tab" literal "$C" \
  '({countsByFilter[target]})' '({countsByFilter[filter]})' "P2 button labelled|P2 label is|H1 switch button"
test_mutant_pinned 12 "P2: heading names the target tab" literal "$C" \
  'No {FILTER_LABELS[filter]} sessions yet' 'No {FILTER_LABELS[target]} sessions yet' "filtered copy names"
test_mutant_pinned 13 "P2: old 'Clear filters' label restored" literal "$C" \
  'Switch to {FILTER_LABELS[target]} ({countsByFilter[target]})' 'Clear filters' "P2 "

pin_self_test "$C" 'Switch to {FILTER_LABELS[target]}' 'Switch to {FILTER_LABELS[filter]}'
crash_self_test "$E" 'if (hasErrors) return "error";'
mutant_summary
