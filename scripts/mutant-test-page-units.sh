#!/usr/bin/env bash
# Mutants for the pages' units wiring, killed by test-page-units-wiring.ts.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/helpers/file-mutant.sh
T=(npx tsx scripts/test-page-units-wiring.ts)
echo "Mutants: page units wiring"
baseline "${T[@]}"
run_mutant "QA3 W2: Today logged sets ignore the profile" src/app/today/page.tsx \
  'units: getUnitsPreference(profile.units) }' 'units: getUnitsPreference(null) }' "${T[@]}"
run_mutant "QA3 V1: Progress volume hardcoded metric" src/app/progress/page.tsx \
  ': formatVolumeLifted(totalVolume!, units)' ': formatVolumeLifted(totalVolume!, "metric")' "${T[@]}"
run_mutant "Progress units not from the profile" src/app/progress/page.tsx \
  'const units = getUnitsPreference(profile.units);' 'const units = getUnitsPreference(null);' "${T[@]}"
run_mutant "Session page drops units" "src/app/session/[id]/page.tsx" \
  '      units={getUnitsPreference(profileRes.data?.units)}
' '' "${T[@]}"
run_mutant "Session page profile select without units" "src/app/session/[id]/page.tsx" \
  '.select("primary_track, has_all_equipment, timezone, units")' '.select("primary_track, has_all_equipment, timezone")' "${T[@]}"
finish_mutants
