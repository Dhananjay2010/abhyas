/**
 * Decides whether to trigger background cleanup of banned exercises.
 * 
 * Returns true when the cleaned exercise list differs from the persisted plan,
 * indicating user's template needs updating to reflect their injury state.
 * 
 * W5 mutant: returns constant (false) - background sweep never runs.
 */
export function shouldTriggerBannedCleanup(cleanupResults: Array<{ changed: boolean }>): boolean {
  return cleanupResults.some(r => r.changed);
}
