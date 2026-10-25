/**
 * Compute which days are marked done in the week view.
 *
 * FIX (b): Week view didn't mark day done after session completed. This pure
 * function takes sessions and returns the set of local dates that should show
 * as done.
 *
 * Done means: a completed session of any type (strength, yoga, breathing) on
 * that local date (timezone-resolved). Keys on actual session.local_date, not
 * the original plan day, so day swaps work correctly.
 */

export function computeCompletedDays(
  sessions: Array<{
    local_date: string;
    status: string;
    actual_type: string | null;
  }>,
): Set<string> {
  const completed = new Set<string>();

  for (const s of sessions) {
    // Any completed session marks the day done (strength, yoga, or breathing)
    if (s.status === "completed") {
      completed.add(s.local_date);
    }
  }

  return completed;
}
