#!/usr/bin/env bash
# Mutants for Today's "What you did" logged sets, killed by
# test-wire-logged-sets.ts (real buildTodayRowsForProgram + wireLoggedSets).
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/helpers/file-mutant.sh
T=(npx tsx scripts/test-wire-logged-sets.ts)
echo "Mutants: logged sets wiring"
baseline "${T[@]}"
run_mutant "helper drops the wireLoggedSets call" src/lib/today/build-today-rows-for-program.ts \
  '  if (logged) wireLoggedSets(rows, logged.exercises, logged.units);' '' "${T[@]}"
run_mutant "row.loggedSets = undefined" src/lib/today/wire-logged-sets.ts \
  'row.loggedSets = formatted;' 'row.loggedSets = undefined;' "${T[@]}"
run_mutant "warm-ups shown" src/lib/today/wire-logged-sets.ts \
  'isWarmupSet: s.is_warmup_set,' 'isWarmupSet: false,' "${T[@]}"
run_mutant "units ignored" src/lib/today/wire-logged-sets.ts \
  '        units,
      );' '        "metric",
      );' "${T[@]}"
run_mutant "page.tsx stops passing the logged sets" src/app/today/page.tsx \
  'logged: loggedSetsRes?.data' 'logged: null && loggedSetsRes?.data' "${T[@]}"
finish_mutants
