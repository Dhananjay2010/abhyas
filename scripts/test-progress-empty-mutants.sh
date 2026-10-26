#!/bin/bash
# Mutants for the Progress empty state (PR #153). Each mutant is applied alone, tested, then reverted.
set -u
cd "$(dirname "$0")/.."
# shellcheck source=scripts/empty-state-mutant-lib.sh
. scripts/empty-state-mutant-lib.sh

echo "=== Progress empty state mutant testing ==="
mutant_init test:progress-empty-state test:progress-units -- src/app/progress/page.tsx src/components/charts.tsx
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

# QA1 P3: empty check uses the same scope as History (any completed session)
test_mutant_pinned 19 "P3: empty check back to block-scoped streaks.totalSessions" literal "$P" \
  'const hasSessionData = hasAnyCompletedSession || hasStrengthData;' \
  'const hasSessionData = streaks.totalSessions > 0 || hasStrengthData;' "P3 empty state NOT shown"
test_mutant_pinned 20 "P3: hasAnyCompletedSession ignores status" literal "$P" \
  '(s) => s.status === "completed" && HISTORY_TYPES' '(s) => HISTORY_TYPES' "P3 empty state still shown"
test_mutant_pinned 21 "P3: hasAnyCompletedSession forced false" literal "$P" \
  'const hasSessionData = hasAnyCompletedSession || hasStrengthData;' \
  'const hasSessionData = false || hasStrengthData;' "P3 empty state NOT shown"
# QA1 P4: copy for one weigh-in per day
test_mutant_pinned 22 "P4: old one-point weigh-in hint" literal "$P" \
  'singlePointHint="Weigh in on another day to see a trend"' 'singlePointHint="Log another weigh-in to see a trend"' "weigh-in hint copy"
test_mutant_pinned 23 "P4: old zero-weigh-in copy" literal "$P" \
  'Weigh-ins on two different days will show a trend.' 'Two data points will show a trend.' "zero weigh-ins copy"

# QA3 r1 (MED-2) Progress mutants (Q8 is equivalent: sessionsRes.error also sets yogaStatsError)
test_mutant_pinned Q5 "progress_summary error not in banner" literal "$P" \
  'const anyLoadError = progressQueryFailed ||' 'const anyLoadError = false ||' "progress_summary rpc error: banner"
test_mutant_pinned Q6 "set-counts error not in banner" literal "$P" \
  'progressQueryFailed || !!setCountsError || yogaStatsError' 'progressQueryFailed || yogaStatsError' "get_session_set_counts rpc error: banner"
test_mutant_pinned Q7 "yogaStatsError not in banner" literal "$P" \
  '!!setCountsError || yogaStatsError' '!!setCountsError' "yoga stats error: banner"
test_mutant_pinned Q9 "body weight counts as session data" literal "$P" \
  'const hasSessionData = hasAnyCompletedSession || hasStrengthData;' \
  'const hasSessionData = hasAnyCompletedSession || hasStrengthData || weightPoints.length > 0;' "empty state shown"
test_mutant_pinned Q10 "bodyweight sessions not counted (post-P3 form of Q10)" literal "$P" \
  'new Set(["weights", "bodyweight", "yoga", "meditation"])' 'new Set(["weights", "yoga", "meditation"])' "Q10 "
test_mutant_pinned Q12 "SinglePoint drops the date" literal "$C" \
  '<p className="mt-1 text-xs text-muted">{point.label}</p>' '' "Q12 |U1 single point shows its date"
test_mutant_pinned Q13 "SinglePoint drops the value" literal "$C" \
  '<p className="text-2xl font-bold tabular-nums">{fmt(point.value)}</p>' '<p className="text-2xl font-bold tabular-nums"></p>' "single|U1 "
test_mutant_pinned Q14 "BarChart single point passes no hint" literal "$C" \
  'if (points.length === 1) return <SinglePoint point={points[0]} fmt={fmt} hint={singlePointHint} />;' 'if (points.length === 1) return <SinglePoint point={points[0]} fmt={fmt} hint="" />;' "BarChart 1 point: shows default hint"
test_mutant_pinned Q17 "empty state ignores load errors" literal "$P" \
  '!hasSessionData && !anyLoadError;' '!hasSessionData;' "empty state suppressed"
test_mutant_pinned Q19 "weight error copy -> empty copy" literal "$P" \
  "Couldn&apos;t load your weight history. You can still log today&apos;s weight." \
  'Log your weight below to start tracking. Weigh-ins on two different days will show a trend.' "does not claim"
# QA3 r1 (MED-1) units mutants
test_mutant_pinned U1 "body-weight chart loses weightUnits" literal "$P" \
  $'            weightUnits={units}\n            title="Body weight"' '            title="Body weight"' "body weight single point|body-weight"
test_mutant_pinned U2 "volume chart loses volumeUnits" literal "$P" \
  ' volumeUnits={units} title="Volume per session"' ' title="Volume per session"' "volume"
test_mutant_pinned U3 "strength charts lose weightUnits" literal "$P" \
  ' weightUnits={e.units} title=' ' title=' "strength"
test_mutant_pinned U4 "SinglePoint ignores fmt (raw kg value)" literal "$C" \
  '{fmt(point.value)}</p>' '{formatValueExact(point.value, "kg")}</p>' "U1 "
test_mutant_pinned U5 "BarChart fmt ignores volumeUnits" literal "$C" \
  '(volumeUnits ? formatVolumeLifted(v, volumeUnits) : formatValueExact(v, unit))' 'formatValueExact(v, unit)' "volume"
test_mutant_pinned U6 "LineChart axis ignores weightUnits" literal "$C" \
  'weightUnits ? formatWeight(v, weightUnits, false, "0") : Math.round(v)' 'Math.round(v)' "U2 axis"
test_mutant_pinned U7 "BarChart axis ignores volumeUnits" literal "$C" \
  '{fmtAxis(max)}' '{Math.round(max).toLocaleString("en-US")}' "U2 axis"
test_mutant_pinned U8 "value table prints raw numbers" literal "$C" \
  '{fmt(p.value)}' '{String(p.value)}' "U4 "
test_mutant_pinned U9 "lb not snapped (raw conversion, 2 dp)" literal "$C" \
  '(weightUnits ? formatWeight(v, weightUnits) : formatValueExact(v, unit))' '(weightUnits === "imperial" ? formatValueExact(v * 2.20462, "lb") : weightUnits ? formatWeight(v, weightUnits) : formatValueExact(v, unit))' "snapped|179\\.5|181 lb|265\\.5"

pin_self_test "$P" 'singlePointHint="Weigh in on another day to see a trend"' 'singlePointHint="x"'
crash_self_test "$P" 'const showSessionsEmpty = !hasSessionData && !anyLoadError;'
mutant_summary
