#!/bin/bash
# Mutants for the Progress empty state (PR #153). Each mutant is applied alone, tested, then reverted.
set -u
cd "$(dirname "$0")/.."
# shellcheck source=scripts/empty-state-mutant-lib.sh
. scripts/empty-state-mutant-lib.sh

echo "=== Progress empty state mutant testing ==="
mutant_init test:progress-empty-state -- src/app/progress/page.tsx src/components/charts.tsx
run_baseline

P=src/app/progress/page.tsx; C=src/components/charts.tsx
test_mutant 6 "showSessionsEmpty forced false" literal "$P" \
  'const showSessionsEmpty = !hasSessionData && !anyLoadError;' 'const showSessionsEmpty = false;'
test_mutant 7 "!hasSessionData -> hasSessionData" literal "$P" \
  'const showSessionsEmpty = !hasSessionData' 'const showSessionsEmpty = hasSessionData'
test_mutant 8 'CTA href="/today" -> href="/"' literal "$P" 'href="/today"' 'href="/"'
test_mutant 9 "Body weight section hidden" regex "$P" \
  '(<section className="mt-10">\s*<h2 className="text-sm font-semibold">Body weight</h2>[\s\S]*?</section>)' \
  '{false && (\1)}'
test_mutant 10 "drop !!weightsRes.error from anyLoadError" literal "$P" '|| !!weightsRes.error ' ''
test_mutant 11 "remove <LogWeight>" literal "$P" '<LogWeight current={latestWeight} />' '{ /* LogWeight removed */ }'
test_mutant 12 "banner reverted to the old condition" literal "$P" \
  '{anyLoadError && (' '{(progressQueryFailed || setCountsError || yogaStatsError) && ('
test_mutant 13 "drop !!volumeRes.error from anyLoadError" literal "$P" '|| !!volumeRes.error ' ''
test_mutant 14 "drop !!strengthRes.error from anyLoadError" literal "$P" '|| !!strengthRes.error ' ''
test_mutant 15 "weight error branch: weightsRes.error ? -> false ?" literal "$P" '{weightsRes.error ? (' '{false ? ('
test_mutant 16 "LineChart single point -> if (false)" literal "$C" \
  $'if (points.length === 1) {\n    return <SinglePoint' $'if (false) {\n    return <SinglePoint'
test_mutant 17 "BarChart single point -> if (false)" literal "$C" \
  'if (points.length === 1) return <SinglePoint' 'if (false) return <SinglePoint'
test_mutant 18 "LineChart singlePointHint default changed" regex "$C" \
  '(export function LineChart[\s\S]*?singlePointHint = )"Log another session to see a trend"' '\1"Different text"'

crash_self_test "$P" 'const showSessionsEmpty = !hasSessionData && !anyLoadError;'
mutant_summary
