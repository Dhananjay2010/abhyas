/**
 * createSaveOnce wraps an async save function to ensure it runs at most once
 * concurrently. Concurrent calls while a save is pending return the same
 * in-flight promise. After a failure, a new call runs again. After success, a
 * call is a no-op.
 *
 * @param fn The save function to guard
 * @returns A wrapped function with the same signature
 */
export function createSaveOnce<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  let inFlightPromise: Promise<any> | null = null;
  let succeeded = false;

  return ((...args: any[]) => {
    // If already succeeded, return a resolved promise (no-op)
    if (succeeded) {
      return Promise.resolve();
    }

    // If a save is in flight, return that promise
    if (inFlightPromise) {
      return inFlightPromise;
    }

    // Start a new save
    inFlightPromise = fn(...args)
      .then(
        (result) => {
          succeeded = true;
          inFlightPromise = null;
          return result;
        },
        (error) => {
          // On failure, clear in-flight so a retry can happen
          inFlightPromise = null;
          throw error;
        }
      );

    return inFlightPromise;
  }) as T;
}
