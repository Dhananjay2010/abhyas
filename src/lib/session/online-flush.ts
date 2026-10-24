/**
 * Register an online event listener that triggers flush on reconnect.
 * Returns a cleanup function to unsubscribe.
 */
export function registerOnlineFlush(
  target: EventTarget,
  onReconnect: () => void | Promise<void>,
): () => void {
  target.addEventListener("online", onReconnect);

  return () => {
    target.removeEventListener("online", onReconnect);
  };
}
