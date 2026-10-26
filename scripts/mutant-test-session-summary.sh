#!/usr/bin/env bash
# Mutants for loadSessionSummary, killed by the in-memory PostgREST scenarios.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/helpers/file-mutant.sh
F=src/lib/session/load-session-summary.ts
T=(npx tsx scripts/test-session-summary-from-db.ts)
echo "Mutants: loadSessionSummary"
baseline "${T[@]}"
run_mutant "history includes this session" "$F" '      .neq("session_exercises.session_id", sessionId)
' '' "${T[@]}"
run_mutant "history includes warm-ups" "$F" '      .eq("is_warmup_set", false)
' '' "${T[@]}"
run_mutant "history includes skipped exercises" "$F" '      .eq("session_exercises.status", "completed")
' '' "${T[@]}"
run_mutant "first page only (no pagination)" "$F" '    if (page.length < HISTORY_PAGE_SIZE) break;' '    break;' "${T[@]}"
run_mutant "this session's warm-ups count" "$F" 'const workingSets = sets.filter((s) => !s.is_warmup_set);' 'const workingSets = sets;' "${T[@]}"
run_mutant "first session claims a PB" "$F" '      bestWeightKg: null,
      bestReps: null,' '      bestWeightKg: 0,
      bestReps: 0,' "${T[@]}"
run_mutant "PB always null" "$F" 'personalBest: personalBest ? describePersonalBest(personalBest, units) : null,' 'personalBest: null,' "${T[@]}"
run_mutant "units ignored" "$F" 'describePersonalBest(personalBest, units)' 'describePersonalBest(personalBest, "metric")' "${T[@]}"
run_mutant "note direction inverted" "$F" 'nextWeight > thisSessionWeight ? "Weight up next time" : "Weight down next time"' 'nextWeight > thisSessionWeight ? "Weight down next time" : "Weight up next time"' "${T[@]}"
finish_mutants
