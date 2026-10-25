/**
 * Compute session duration for display (item 9).
 * 
 * When session.duration_seconds is NULL but there are logged sets,
 * compute from started_at to the last set's completed_at.
 * 
 * @param durationSeconds - Stored duration_seconds from session (can be NULL)
 * @param startedAt - Session start timestamp
 * @param lastSetCompletedAt - The last set's completed_at timestamp (if sets exist)
 * @returns Duration in seconds, or null if no duration can be determined
 */
export function computeSessionDuration(
  durationSeconds: number | null,
  startedAt: string | null,
  lastSetCompletedAt: string | null
): number | null {
  // If duration_seconds is set, use it
  if (durationSeconds !== null && durationSeconds !== undefined) {
    return durationSeconds;
  }

  // If duration_seconds is NULL but we have sets, compute from started_at to last set
  if (startedAt && lastSetCompletedAt) {
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(lastSetCompletedAt).getTime();
    const computed = Math.round((endMs - startMs) / 1000);
    // Only return if it's a valid positive duration
    return computed > 0 ? computed : null;
  }

  // No duration available
  return null;
}

/**
 * Format duration in minutes, never showing "0 min" for NULL.
 * 
 * Item 9 scope: "—" only for finished strength sessions (completed or ended early)
 * with null duration. Other rows (in progress, planned-then-skipped, breathing) return null.
 * 
 * @param seconds - Duration in seconds (can be null)
 * @param status - Session status
 * @param actualType - Session type
 * @returns Formatted string like "45 min" or "<1 min", "—" for finished strength w/ null, or null
 */
export function formatDurationMinutes(
  seconds: number | null,
  status?: string | null,
  actualType?: string | null
): string | null {
  // A real 0 duration (ended early with no sets) returns null - let caller show "Ended early"
  if (seconds === 0) return null;
  
  // If duration exists, format it normally
  if (seconds !== null && seconds !== undefined) {
    // Show "<1 min" for any duration less than 60 seconds
    if (seconds > 0 && seconds < 60) return "<1 min";
    
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  }

  // seconds is null - decide whether to show "—"
  // Item 9: Only show "—" for finished strength sessions (completed or ended early)
  const isFinished = status === "completed" || status === "skipped";
  const isStrength = actualType === "weights" || actualType === "bodyweight";
  
  if (isFinished && isStrength) {
    return "—";
  }

  // Other cases (in progress, planned, breathing/yoga) return null
  return null;
}
