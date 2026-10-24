/**
 * Busy-guard helpers for the session runner.
 * 
 * Prevents double-tap issues by checking if an action is already in flight.
 */

export type BusyGuardResult<T> = { busy: true } | { busy: false; result: T };

/**
 * Pure helper that wraps an async operation with a busy check.
 * 
 * Returns { busy: true } if already in flight, otherwise executes the function
 * and returns { busy: false, result }.
 */
export async function withBusyGuard<T>(
  isBusy: () => boolean,
  setBusy: (busy: boolean) => void,
  fn: () => Promise<T>
): Promise<BusyGuardResult<T>> {
  if (isBusy()) {
    return { busy: true };
  }

  setBusy(true);
  try {
    const result = await fn();
    return { busy: false, result };
  } finally {
    setBusy(false);
  }
}
