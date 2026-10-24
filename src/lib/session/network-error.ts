/**
 * Detect network errors from fetch failures or thrown exceptions.
 * 
 * Returns true if the error is a network connectivity issue (offline, timeout,
 * DNS failure, etc.), false for application errors (validation, auth, etc.).
 * 
 * Pure function for testability.
 */
export function isNetworkError(error: unknown): boolean {
  // TypeError is the standard thrown error for network failures in fetch
  if (error instanceof TypeError) {
    return true;
  }

  // Check error message for common network failure strings
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("failed to fetch") ||
      message.includes("network request failed") ||
      message.includes("networkerror") ||
      message.includes("load failed")
    ) {
      return true;
    }
  }

  // Check if browser reports offline
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  return false;
}
