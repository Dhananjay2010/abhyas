/**
 * Build view model for history detail page.
 * 
 * Computes Volume (excluding warm-ups) and Duration text for display.
 * All inline math and filtering happens here, not in the page component.
 */

import { formatDurationMinutes } from "./compute-duration";

export interface HistoryDetailView {
  volumeKg: number;
  durationText: string | null;
}

export function buildHistoryDetailView(
  session: {
    duration_seconds: number | null;
    status: string | null;
    actual_type: string | null;
  },
  sets: Array<{
    reps: number | null;
    weight_kg: number | null;
    is_warmup_set: boolean;
  }>
): HistoryDetailView {
  // Volume: filter warm-ups, then sum reps * weight
  const volumeKg = sets
    .filter((s) => !s.is_warmup_set)
    .reduce((n, s) => n + (s.reps ?? 0) * Number(s.weight_kg ?? 0), 0);

  // Duration: use formatDurationMinutes for '<1 min' / 'X min' / '—'
  const durationText = formatDurationMinutes(
    session.duration_seconds,
    session.status,
    session.actual_type
  );

  return { volumeKg, durationText };
}
