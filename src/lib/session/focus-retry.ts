/**
 * Session focus/visibility retry helpers.
 * 
 * Pure function that sets up focus and visibility listeners for pending set retry.
 */

/**
 * Register focus and visibilitychange listeners that trigger a retry callback.
 * Returns a cleanup function.
 * 
 * @param addEventListener - window.addEventListener or document.addEventListener
 * @param removeEventListener - cleanup counterpart
 * @param retry - callback to invoke on focus/visibility
 * @returns cleanup function
 */
export function registerFocusRetry(
  addEventListener: (type: string, handler: () => void) => void,
  removeEventListener: (type: string, handler: () => void) => void,
  retry: () => void
): () => void {
  const handleFocus = () => {
    retry();
  };

  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      retry();
    }
  };

  // Register focus listener (always available)
  addEventListener("focus", handleFocus);
  
  // Register visibility listener (only if document is available)
  const hasDocument = typeof document !== "undefined";
  if (hasDocument) {
    addEventListener("visibilitychange", handleVisibilityChange);
  }

  // Trigger retry on mount
  retry();

  // Return cleanup
  return () => {
    removeEventListener("focus", handleFocus);
    if (hasDocument) {
      removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };
}
