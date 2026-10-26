/**
 * Compute which days are marked as done in the week view.
 *
 * FIX (b): Extracted for testing so mutants like `isDone = false` are killed.
 */

/**
 * Return a Set of local_date strings for days that should be marked done.
 *
 * A day is done if it has a completed session (strength, yoga, or breathing).
 */
export function computeDoneDays(sessions: { local_date: string; status: string; actual_type: string | null }[]): Set<string> {
  const done = new Set<string>();
  
  for (const s of sessions) {
    if (s.status === "completed" && s.actual_type) {
      done.add(s.local_date);
    }
  }
  
  return done;
}
