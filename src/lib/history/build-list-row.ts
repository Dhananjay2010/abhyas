/**
 * Build view model for history list row.
 * 
 * Computes duration text for display using formatDurationMinutes.
 * All inline math happens here, not in the list component.
 */

import { formatDurationMinutes } from "./compute-duration";

export interface HistoryListRow {
  durationText: string | null;
}

export function buildHistoryListRow(session: {
  duration_seconds: number | null;
}): HistoryListRow {
  // Duration: use formatDurationMinutes for '<1 min' / 'X min' / '—'
  // List assumes completed strength sessions
  const durationText = formatDurationMinutes(
    session.duration_seconds,
    "completed",
    "weights"
  );

  return { durationText };
}
