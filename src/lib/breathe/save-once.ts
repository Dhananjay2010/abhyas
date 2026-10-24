/**
 * createSaveOnce wraps an async save function to ensure it runs at most once
 * concurrently. Concurrent calls while a save is pending return the same
 * in-flight promise. After a failure, a new call runs again. After success, a
 * call is a no-op.
 *
 * @param fn The save function to guard
 * @param isSuccess Function to determine if result represents success
 * @returns A wrapped function with the same signature
 */
export function createSaveOnce<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  isSuccess: (result: unknown) => boolean
): T {
  let inFlightPromise: Promise<unknown> | null = null;
  let succeeded = false;

  return ((...args: never[]) => {
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
          if (isSuccess(result)) {
            succeeded = true;
          }
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
