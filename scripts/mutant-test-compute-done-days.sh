#!/usr/bin/env bash
# Mutants for the "Your week" done tick, killed by test-compute-done-days.ts
# (real helpers) and test-week-list.tsx (real WeekList render).
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/helpers/file-mutant.sh
T=(bash -c 'npx tsx scripts/test-compute-done-days.ts && npx tsx scripts/test-week-list.tsx')
echo "Mutants: week done tick"
baseline "${T[@]}"
run_mutant "const isDone = false" src/lib/today/compute-done-days.ts \
  'const isDone = done.has(date);' 'const isDone = false;' "${T[@]}"
run_mutant "in-progress counts as done" src/lib/today/compute-done-days.ts \
  'if (s.status === "completed" && s.actual_type) {' 'if (s.actual_type) {' "${T[@]}"
run_mutant "row date off the chosen-by-day window" src/lib/today/compute-done-days.ts \
  'const date = weekRowDate(localToday, todayIndex, d.day_index);' 'const date = weekRowDate(localToday, todayIndex, d.day_index + 6);' "${T[@]}"
run_mutant "shared window rule shifted" src/lib/today/chosen-by-day.ts \
  'return addDays(localToday, (dayIndex - todayIndex + 7) % 7);' 'return addDays(localToday, (dayIndex - todayIndex + 6) % 7);' "${T[@]}"
run_mutant "tick never rendered" src/app/today/week-list.tsx \
  '{d.isDone && (' '{false && (' "${T[@]}"
run_mutant "page.tsx renders an empty week" src/app/today/page.tsx \
  'days={buildWeekDays({ days: days ?? [], sessions: allSessions, localToday, todayIndex })}' 'days={buildWeekDays({ days: days ?? [], sessions: [], localToday, todayIndex })}' "${T[@]}"
finish_mutants
