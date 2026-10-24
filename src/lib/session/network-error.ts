/**
 * True when a thrown error means "the request never reached the server":
 * the browser reports offline, or a fetch failed at the network layer.
 * Deliberately NOT every TypeError — a coding bug must surface as an error, not "you're offline".
 */
const NETWORK_MESSAGES = ["failed to fetch", "network request failed", "networkerror", "load failed"];

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return NETWORK_MESSAGES.some((m) => message.includes(m));
}

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
