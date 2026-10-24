import { isNetworkError } from "./network-error";

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Dependencies needed to run finish/end-early flows.
 * Injected to make the functions pure and testable.
 */
export interface FinishFlowDeps {
  finishSession: (params: {
    sessionId: string;
    durationSeconds: number;
    cooldownCompleted: boolean;
  }) => Promise<{ ok: true; data: { status: "completed" | "skipped" } } | { ok: false; error?: string }>;
  abandonSession: (sessionId: string, elapsedSeconds: number) => Promise<{ ok: true } | { ok: false; error?: string }>;
  refreshAfterSession: () => Promise<Result<undefined>>;
  stopElapsed: () => number;
  resumeElapsed: () => void;
  setError: (message: string | null) => void;
  setPhase: (phase: "done") => void;
  setEndedEarly: (ended: boolean) => void;
  navigate: (path: string) => void;
  onExit: (() => void) | null | undefined;
  inFlight: { current: boolean };
}

/**
 * Run the finish flow (Done / Skip cool-down / last exercise with no cool-down).
 * Pure function with dependency injection for testability.
 * 
 * @returns Promise<boolean> - true if finish succeeded, false if it failed
 */
export async function runFinish(
  deps: FinishFlowDeps,
  params: {
    sessionId: string;
    cooldownCompleted: boolean;
  },
): Promise<boolean> {
  if (deps.inFlight.current) return false;
  deps.inFlight.current = true;

  const durationSeconds = deps.stopElapsed();

  try {
    const result = await deps.finishSession({
      sessionId: params.sessionId,
      durationSeconds,
      cooldownCompleted: params.cooldownCompleted,
    });

    if (!result.ok) {
      deps.resumeElapsed();
      deps.setError("Couldn't finish the session. Try again.");
      deps.inFlight.current = false;
      return false;
    }

    deps.setError(null);

    // Always show summary, even for skipped sessions
    deps.inFlight.current = false;
    deps.setPhase("done");
    return true;
  } catch (err) {
    deps.resumeElapsed();
    if (isNetworkError(err)) {
      deps.setError("You're offline. Your session wasn't finished – try again when you're back online.");
    } else {
      deps.setError("Couldn't finish the session. Try again.");
    }
    deps.inFlight.current = false;
    return false;
  }
}

/**
 * End the session early ("skip rest of workout" button) and navigate away on success.
 * 
 * Returns false if the abandon failed, true otherwise.
 */
export async function runEndEarly(
  deps: FinishFlowDeps,
  args: {
    sessionId: string;
    durationSeconds: number;
  },
): Promise<boolean> {
  if (deps.inFlight.current) return false;
  deps.inFlight.current = true;

  try {
    const result = await deps.abandonSession({
      sessionId: args.sessionId,
      durationSeconds: args.durationSeconds,
    });

    if (result.ok) {
      deps.setError(null);
      deps.setEndedEarly(true);
      deps.setPhase("done");
      deps.onExit?.();
      await deps.refreshAfterSession();
      return true;
    } else {
      // Abandon failed
      deps.setError(result.error ?? "Failed to end the session early. Check your network and try again.");
      return false;
    }
  } finally {
    deps.inFlight.current = false;
  }
}

/**
 * Decide whether to show "Try again" button after a finish attempt.
 * 
 * Returns true when:
 * - The finish failed (succeeded = false)
 * - The cooldown was NOT completed (if cooldown is done, we navigate away)
 * 
 * @param succeeded - Whether runFinish returned true
 * @param cooldownCompleted - Whether the cooldown phase was completed
 */
export function shouldShowFinishRetry(succeeded: boolean, cooldownCompleted: boolean): boolean {
  return !succeeded && !cooldownCompleted;
}
