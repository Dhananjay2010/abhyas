/**
 * Pure text helpers for end-early confirmation and summary.
 */

/**
 * Generate the confirmation dialog title text.
 * @param setsDone - Number of sets completed
 * @param setsPlanned - Total number of sets planned
 * @returns The dialog title text
 */
export function endEarlyConfirmTitle(setsDone: number, setsPlanned: number): string {
  return `End now? ${setsDone} of ${setsPlanned} sets done`;
}

/**
 * Generate the summary title for a session.
 * @param endedEarly - Whether the session was ended early
 * @returns The summary title text
 */
export function sessionSummaryTitle(endedEarly: boolean): string {
  return endedEarly ? "Session ended early" : "Session complete";
}
