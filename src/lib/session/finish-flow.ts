import { isNetworkError } from "./network-error";

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
  refreshAfterSession: () => Promise<void>;
  stopElapsed: () => number;
  resumeElapsed: () => void;
  setError: (message: string | null) => void;
  setPhase: (phase: "done") => void;
  setEndedEarly: (ended: boolean) => void;
  navigate: (path: string) => void;
  onExit: (() => void) | null;
  inFlight: { current: boolean };
}

/**
 * Run the finish flow (Done / Skip cool-down / last exercise with no cool-down).
 * Pure function with dependency injection for testability.
 */
export async function runFinish(
  deps: FinishFlowDeps,
  params: {
    sessionId: string;
    cooldownCompleted: boolean;
  },
): Promise<void> {
  if (deps.inFlight.current) return;
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
      return;
    }

    deps.setError(null);

    if (result.data.status === "skipped") {
      // 0 working sets: navigate to Today with no summary
      try {
        await deps.refreshAfterSession();
      } catch {
        // Still navigate even if refresh fails (offline)
      }
      deps.inFlight.current = false;
      if (deps.onExit) deps.onExit();
      else deps.navigate("/today");
    } else {
      // Completed: show summary
      deps.inFlight.current = false;
      deps.setPhase("done");
    }
  } catch (err) {
    deps.resumeElapsed();
    if (isNetworkError(err)) {
      deps.setError("You're offline. Your session wasn't finished – try again when you're back online.");
    } else {
      deps.setError("Couldn't finish the session. Try again.");
    }
    deps.inFlight.current = false;
  }
}

/**
 * Run the end-early flow (End session early button).
 * Pure function with dependency injection for testability.
 */
export async function runEndEarly(
  deps: Omit<FinishFlowDeps, "finishSession">,
  params: {
    sessionId: string;
    setsDone: number;
    setConfirming: (value: null) => void;
    setOfflineError: (value: boolean) => void;
    endingRef: { current: boolean };
    setEnding: (value: boolean) => void;
  },
): Promise<void> {
  if (params.endingRef.current) return;
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
      return;
    }

    params.setConfirming(null);
    params.setOfflineError(false);

    if (params.setsDone === 0) {
      // 0 sets: navigate to Today
      try {
        await deps.refreshAfterSession();
      } catch {
        // Still navigate even if refresh fails (offline)
      }
      params.endingRef.current = false;
      params.setEnding(false);
      if (deps.onExit) deps.onExit();
      else deps.navigate("/today");
    } else {
      // With sets: show summary
      deps.setEndedEarly(true);
      params.endingRef.current = false;
      params.setEnding(false);
      deps.setPhase("done");
    }
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
  }
}
