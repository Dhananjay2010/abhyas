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
