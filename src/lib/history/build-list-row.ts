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

export function buildHistoryListRow(
  durationSeconds: number | null,
  status: string | null,
  actualType: string | null
): HistoryListRow {
  // Duration: use formatDurationMinutes for '<1 min' / 'X min' / '—'
  const durationText = formatDurationMinutes(
    durationSeconds,
    status,
    actualType
  );

  return { durationText };
}
