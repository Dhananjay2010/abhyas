/**
 * Pure function to determine Progress page empty state.
 * 
 * @param hasSessionData - Whether any session data exists
 * @param anyLoadError - Whether any data fetch errors occurred
 * @returns Whether to show the empty state
 */
export function shouldShowProgressEmpty(
  hasSessionData: boolean,
  anyLoadError: boolean
): boolean {
  return !hasSessionData && !anyLoadError;
}
