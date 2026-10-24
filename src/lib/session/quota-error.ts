/**
 * Detect quota exceeded errors across browsers.
 *
 * Chrome: DOMException with code 22
 * Firefox: DOMException with code 1014
 * Safari: DOMException with name 'QuotaExceededError' or 'NS_ERROR_DOM_QUOTA_REACHED'
 *
 * Pure function for testability.
 */
export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return (
    error.code === 22 ||
    error.code === 1014 ||
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}
