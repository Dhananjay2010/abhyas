/**
 * Guard to prevent concurrent execution of an async action.
 * 
 * Returns a wrapped function that:
 * - Ignores calls while a previous call is still in flight
 * - Ensures only one call executes at a time, even if multiple calls arrive in the same tick
 * - Releases the guard only after the action and any synchronous cleanup completes
 * 
 * This prevents triple-tap bugs where rapid successive taps create duplicate actions.
 */
export function guardConcurrent<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | undefined> {
  let inFlight = false;

  return async (...args: TArgs): Promise<TResult | undefined> => {
    // Check-and-set must be synchronous to prevent same-tick races
    if (inFlight) {
      return undefined;
    }
    inFlight = true;

    try {
      const result = await action(...args);
      return result;
    } finally {
      // Release guard only after action completes (including any synchronous cleanup)
      inFlight = false;
    }
  };
}
