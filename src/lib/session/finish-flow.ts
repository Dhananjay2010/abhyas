import { isNetworkError } from "./network-error";

/**
 * Run the end-early flow (End session early button).
 * Pure function with dependency injection for testability.
 */
export async function runEndEarly(
  deps: {
    abandonSession: (sessionId: string, durationSeconds: number) => Promise<{ ok: boolean; error?: string }>;
    stopElapsed: () => number;
    resumeElapsed: () => void;
    setError: (error: string | null) => void;
    navigateToToday: () => void;
  },
  params: {
    sessionId: string;
    setConfirming: (value: null) => void;
    setOfflineError: (value: boolean) => void;
    endingRef: { current: boolean };
    setEnding: (value: boolean) => void;
  },
): Promise<boolean> {
  if (params.endingRef.current) return false;
  params.endingRef.current = true;
  params.setEnding(true);

  const durationSeconds = deps.stopElapsed();

  try {
    const result = await deps.abandonSession(params.sessionId, durationSeconds);

    if (!result.ok) {
      deps.resumeElapsed();
      params.setConfirming(null);
      params.setOfflineError(false);
      deps.setError("Couldn't end the session. Try again.");
      params.endingRef.current = false;
      params.setEnding(false);
      return false;
    }

    params.setConfirming(null);
    params.setOfflineError(false);

    // Success: navigate to /today (works for both completed and skipped outcomes)
    params.endingRef.current = false;
    params.setEnding(false);
    deps.navigateToToday();
    return true;
  } catch (err) {
    deps.resumeElapsed();
    if (isNetworkError(err)) {
      params.setOfflineError(true);
    } else {
      params.setConfirming(null);
      params.setOfflineError(false);
      deps.setError("Couldn't end the session. Try again.");
    }
    params.endingRef.current = false;
    params.setEnding(false);
    return false;
  }
}

/**
 * Decide whether to show "Try again" button after a finish attempt.
 * 
 * Returns true when:
 * - The finish failed (succeeded = false)
 * - The cooldown was NOT completed (if cooldown is done, the summary shows immediately)
 * 
 * Note: On a failed cool-down Done, the runner stays on the cool-down screen
 * and shows the retry button.
 * 
 * @param succeeded - Whether runFinish returned true
 * @param cooldownCompleted - Whether the cooldown phase was completed
 */
export function shouldShowFinishRetry(succeeded: boolean, cooldownCompleted: boolean): boolean {
  return !succeeded && !cooldownCompleted;
}
