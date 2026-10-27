/**
 * Pure text helpers for end-early confirmation.
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
