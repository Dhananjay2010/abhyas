/**
 * Pure helper to check if the app is offline.
 * Safe to call during SSR (returns false on the server).
 */
export function isOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return !navigator.onLine;
}
