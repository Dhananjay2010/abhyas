/**
 * Guard concurrent execution using a ref.
 * 
 * Returns a guard function that ensures only one execution at a time.
 * Concurrent calls are rejected immediately (return undefined).
 * 
 * Used to prevent double-tap issues where two rapid button presses
 * would otherwise trigger two server calls.
 */
export function createConcurrentGuard<T>(
  fn: () => Promise<T>,
  busyRef: { current: boolean },
): () => Promise<T | undefined> {
  return async () => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    try {
      return await fn();
    } finally {
      busyRef.current = false;
    }
  };
}
