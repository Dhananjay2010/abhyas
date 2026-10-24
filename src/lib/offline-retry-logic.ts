/**
 * Pure offline retry logic, extracted for testing.
 *
 * Determines the retry target based on:
 * 1. Navigator online status
 * 2. Test fetch result
 * 3. URL parameter from the query string
 */

import { safeNextPath } from "./safe-next-path";

export type RetryResult =
  | { type: "still-offline" }
  | { type: "reload" }
  | { type: "navigate"; url: string };

/**
 * Determine retry target after connectivity check.
 *
 * @param online - navigator.onLine status
 * @param fetchSucceeded - Whether test fetch to /favicon.ico succeeded
 * @param urlParam - Value of ?url= query parameter (or null if absent)
 * @returns Action to take: still-offline, reload, or navigate to URL
 */
export function determineRetryAction(
  online: boolean,
  fetchSucceeded: boolean,
  urlParam: string | null
): RetryResult {
  // If navigator says offline or fetch failed, stay on offline page
  if (!online || !fetchSucceeded) {
    return { type: "still-offline" };
  }

  // Back online, decide where to go
  if (urlParam) {
    // Navigate to the validated safe path
    return { type: "navigate", url: safeNextPath(urlParam, "/") };
  } else {
    // No url param: reload current page
    return { type: "reload" };
  }
}
