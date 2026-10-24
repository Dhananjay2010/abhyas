/**
 * Detect network errors for offline handling.
 *
 * Network errors occur when:
 * - Fetch fails (TypeError: Failed to fetch)
 * - Network request fails (TypeError)
 * - navigator.onLine is false
 *
 * Used to provide user-friendly offline messages instead of generic error text.
 */

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.includes("failed to fetch") ||
      message.includes("network request failed") ||
      message.includes("load failed")
    );
  }

  return false;
}
