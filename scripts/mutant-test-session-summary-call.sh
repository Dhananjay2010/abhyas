#!/usr/bin/env bash
# Mutants for the runner's banner and end-of-session summary, killed by the
# real SessionRunner render in test-session-summary-banner.tsx.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/helpers/file-mutant.sh
F="src/app/session/[id]/session-runner.tsx"
T=(npx tsx scripts/test-session-summary-banner.tsx)
echo "Mutants: runner banner + summary"
baseline "${T[@]}"
run_mutant "drop the getSessionSummary call" "$F" 'actions.getSessionSummary(sessionId).then(' 'Promise.resolve({ ok: false as const, error: "" }).then(' "${T[@]}"
run_mutant "summary result not rendered" "$F" '          setProgressNotes(result.data);' '' "${T[@]}"
run_mutant "banner labelled with the next exercise" "$F" '<span className="font-semibold">{bannerContent.name}:</span>' '<span className="font-semibold">{current.name}:</span>' "${T[@]}"
run_mutant "banner not cleared on skip" "$F" '    if (skipped || !result.data?.message) {
      setBannerContent(null);
    } else if (result.data) {' '    if (skipped || !result.data?.message) {
    } else if (result.data) {' "${T[@]}"
finish_mutants
