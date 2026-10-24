/**
 * Request sequence tracker to ignore stale save responses.
 * Prevents overlapping saves where the first fails from rolling back the screen
 * while the DB keeps the second save's result.
 */
export function createRequestSequence() {
  let counter = 0;
  
  return {
    next: () => ++counter,
    isCurrent: (seq: number) => seq === counter,
  };
}
