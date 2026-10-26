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
run_mutant "drop the getSessionSummary call" "$F" '    actions
      .getSessionSummary(sessionId)
' '    Promise.resolve({ ok: true as const, data: [] as SummaryNote[] })
' "${T[@]}"
run_mutant "summary result not rendered" "$F" '          setProgressNotes(result.data);' '' "${T[@]}"
run_mutant "banner labelled with the next exercise" "$F" '<span className="font-semibold">{bannerContent.name}:</span>' '<span className="font-semibold">{current.name}:</span>' "${T[@]}"
run_mutant "banner not cleared on skip" "$F" '    if (skipped || !result.data?.message) {
      setBannerContent(null);
    } else if (result.data) {' '    if (skipped || !result.data?.message) {
    } else if (result.data) {' "${T[@]}"
run_mutant "total volume hardcoded to kg" "$F" '<Stat label="Total volume" value={formatVolumeLifted(volume, units)} />' '<Stat label="Total volume" value={`${Math.round(volume)} kg`} />' "${T[@]}"
run_mutant "total volume ignores units" "$F" '<Stat label="Total volume" value={formatVolumeLifted(volume, units)} />' '<Stat label="Total volume" value={formatVolumeLifted(volume, "metric")} />' "${T[@]}"
run_mutant "units prop default imperial" "$F" '  units = "metric",' '  units = "imperial",' "${T[@]}"
run_mutant "QA3 R1: summary failure marks loaded" "$F" '        if (result.ok) {
          setProgressNotes(result.data);' '        if (true) {
          setProgressNotes(result.ok ? result.data : []);' "${T[@]}"
run_mutant "rejection swallowed (no error)" "$F" '        if (!cancelled) setSummaryError(true);' '' "${T[@]}"
run_mutant "ok:false shows no error" "$F" '        } else {
          setSummaryError(true);
        }' '        }' "${T[@]}"
run_mutant "Retry does not refetch" "$F" '                setSummaryAttempt((n) => n + 1);' '' "${T[@]}"
run_mutant "Retry button never rendered" "$F" '        {summaryError && (' '        {false && (' "${T[@]}"
finish_mutants
