#!/usr/bin/env bash
# Mutants for the runner's banner and end-of-session summary, killed by the
# real SessionRunner render in test-session-summary-banner.tsx. The helper
# checks a baseline first and reports a crash as ERROR, not KILLED.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/helpers/file-mutant.sh
F="src/app/session/[id]/session-runner.tsx"
T=(npx tsx scripts/test-session-summary-banner.tsx)
echo "Mutants: runner banner + summary"
baseline "${T[@]}"
# --- "What changed for next time" = this mount's banner messages only (M-1)
run_mutant "summary falls back to DB-derived notes" "$F" \
  '    const changed = changeNotes;' \
  '    const changed = changeNotes.length > 0 ? changeNotes : (progressNotes as unknown as typeof changeNotes).map((n) => ({ ...n, id: n.name, message: (n as unknown as { message?: string }).message ?? "" }));' "${T[@]}"
run_mutant "drop the collected messages" "$F" \
  '      setChangeNotes((prev) => [...prev.filter((n) => n.id !== note.id), note]);' '' "${T[@]}"
run_mutant "note uses the next exercise's name" "$F" \
  '      const note = { id: current.id, name: current.name, message: result.data.message };' \
  '      const note = { id: current.id, name: exercises[exerciseIndex + 1]?.name ?? current.name, message: result.data.message };' "${T[@]}"
run_mutant "note keeps the previous banner's message" "$F" \
  '      const note = { id: current.id, name: current.name, message: result.data.message };' \
  '      const note = { id: current.id, name: current.name, message: bannerContent?.message ?? result.data.message };' "${T[@]}"
run_mutant "notes in reverse order" "$F" \
  '      setChangeNotes((prev) => [...prev.filter((n) => n.id !== note.id), note]);' \
  '      setChangeNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)]);' "${T[@]}"
run_mutant "skipped exercise adds a note" "$F" \
  '    if (skipped || !result.data?.message) {
      setBannerContent(null);' \
  '    if (!result.data?.message) {
      setBannerContent(null);' "${T[@]}"
# --- PBs from the server, error + Retry (QA3 MED-2)
run_mutant "drop the getSessionSummary call" "$F" '    actions
      .getSessionSummary(sessionId)
' '    Promise.resolve({ ok: true as const, data: [] as SummaryNote[] })
' "${T[@]}"
run_mutant "summary result not rendered" "$F" '          setProgressNotes(result.data);' '' "${T[@]}"
run_mutant "QA3 R1: summary failure marks loaded" "$F" '        if (result.ok) {
          setProgressNotes(result.data);' '        if (true) {
          setProgressNotes(result.ok ? result.data : []);' "${T[@]}"
run_mutant "rejection swallowed (no error)" "$F" '        if (!cancelled) setSummaryError(true);' '' "${T[@]}"
run_mutant "ok:false shows no error" "$F" '        } else {
          setSummaryError(true);
        }' '        }' "${T[@]}"
run_mutant "Retry does not refetch" "$F" '                setSummaryAttempt((n) => n + 1);' '' "${T[@]}"
run_mutant "Retry button never rendered" "$F" '        {summaryError && (' '        {false && (' "${T[@]}"
# --- banner
run_mutant "banner labelled with the next exercise" "$F" '<span className="font-semibold">{bannerContent.name}:</span>' '<span className="font-semibold">{current.name}:</span>' "${T[@]}"
run_mutant "banner not cleared on skip" "$F" '      setBannerContent(null);
      setChangeNotes' '      setChangeNotes' "${T[@]}"
# --- Total volume units (L-1)
run_mutant "total volume hardcoded to kg" "$F" '<Stat label="Total volume" value={formatVolumeLifted(volume, units)} />' '<Stat label="Total volume" value={`${Math.round(volume)} kg`} />' "${T[@]}"
run_mutant "total volume ignores units" "$F" '<Stat label="Total volume" value={formatVolumeLifted(volume, units)} />' '<Stat label="Total volume" value={formatVolumeLifted(volume, "metric")} />' "${T[@]}"
run_mutant "units prop default imperial" "$F" '  units = "metric",' '  units = "imperial",' "${T[@]}"
finish_mutants
