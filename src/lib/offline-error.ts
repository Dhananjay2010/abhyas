/**
 * Detect offline errors and network failures.
 *
 * Determines whether an error thrown during rendering or navigation
 * was caused by the user being offline or by a failed network request.
 *
 * Used by error boundaries (error.tsx, global-error.tsx) to show a
 * friendly "You're offline" message instead of "Something went wrong".
 */

/**
 * Check if an error represents an offline condition.
 *
 * Returns true when:
 * - navigator.onLine is explicitly false (browser offline state)
 * - error is a TypeError with "Failed to fetch" message (fetch() offline)
 * - error is a ChunkLoadError (Next.js code-split chunks failed to load)
 * - error name is "NetworkError" or message contains "NetworkError"
 *
 * @param error - The error object from the error boundary
 * @param online - Current value of navigator.onLine (defaults to true server-side)
 * @returns true if the error is caused by offline/network failure
 */
export function isOfflineError(
  error: Error | unknown,
  online: boolean = typeof navigator !== "undefined" ? navigator.onLine : true
): boolean {
  // If the browser reports offline, it's offline
  if (!online) {
    return true;
  }

  // Not an Error object (could be a thrown string or null)
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Fetch API offline: TypeError with "Failed to fetch"
  if (name === "typeerror" && message.includes("failed to fetch")) {
    return true;
  }

  // Next.js chunk load errors (dynamic imports, lazy components)
  if (name === "chunkerror" || name === "chunkloaderror" || message.includes("loading chunk")) {
    return true;
  }

  // Generic network errors
  if (name === "networkerror" || message.includes("network error")) {
    return true;
  }

  // Load failed (resource failed to load)
  if (message.includes("load failed") || message.includes("failed to load")) {
    return true;
  }

  return false;
}
