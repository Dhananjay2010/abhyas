#!/usr/bin/env bash
# Mutants for formatLoggedSets, killed by test-format-logged-sets.ts.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/helpers/file-mutant.sh
F=src/lib/session/format-logged-sets.ts
T=(npx tsx scripts/test-format-logged-sets.ts)
echo "Mutants: formatLoggedSets"
baseline "${T[@]}"
run_mutant "always per-set" "$F" '  if (allSameWeight) {' '  if (false) {' "${T[@]}"
run_mutant "include warm-ups" "$F" 'const working = sets.filter((s) => !s.isWarmupSet);' 'const working = sets;' "${T[@]}"
run_mutant "0 / blank sets folded into the shared weight (QA3 LOW-6)" "$F" \
  '    working.every(isWeighted) && working.every((s) => s.weightKg === working[0].weightKg);' \
  '    working.filter(isWeighted).every((s) => s.weightKg === working.find(isWeighted)!.weightKg);' "${T[@]}"
run_mutant "0 kg counts as weighted" "$F" 's.weightKg !== null && s.weightKg > 0;' 's.weightKg !== null;' "${T[@]}"
run_mutant "timed sets drop their weight (QA3 LOW-6)" "$F" \
  '  if (!working.some(isWeighted)) {' '  if (metric === "seconds" || !working.some(isWeighted)) {' "${T[@]}"
run_mutant "units ignored" "$F" 'formatWeight(kg, units === "imperial" ? "imperial" : "metric")' 'formatWeight(kg, "metric")' "${T[@]}"
finish_mutants
