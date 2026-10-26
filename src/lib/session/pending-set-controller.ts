/**
 * Pending set controller - pure logic for session expiry retry.
 * 
 * Extracted from React to be testable with typed fakes. The session-runner.tsx
 * component is a thin wrapper that wires DOM events to this controller and
 * renders from its state.
 */

import type { Result } from "@/app/session/actions";
import { isSessionExpired } from "@/lib/auth/session-expired";
import { isOfflineError } from "@/lib/offline-error";
import {
  isDuplicateError,
  loadPendingSets,
  savePendingSet,
  clearPendingSet,
  clearPendingSets,
  type PendingSet,
  type Storage,
} from "./pending-set-retry";
import type { PendingSetDeps } from "./pending-set-deps";
import {
  createRetryScheduler,
  type RetryTimer,
  type RetryScheduler,
} from "./pending-set-retry-scheduler";

export type LogSetFunction = (input: {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds?: number | null;
}) => Promise<Result | { ok: false; reason: "set_exists"; savedSets: Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null }> }>;

/**
 * Helper: Can we replay pending sets for this session status?
 * Only allow replay if the session is still in progress.
 */
export function canReplayForStatus(sessionStatus: string): boolean {
  return sessionStatus === "in_progress";
}

export type PendingSetState = {
  pending: PendingSet[];
  expired: boolean;
  retrying: boolean;
  error: string | null;
  replayed: PendingSet[];
  conflicts: number;
};

type SubmitResult =
  | { status: "saved" }
  | { status: "saved"; reason: "set_exists"; savedSets: Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null }> }
  | { status: "expired" }
  | { status: "queued" }
  | { status: "failed"; error: string };

type PendingSetController = {
  submit(set: {
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds?: number | null;
    clientId: string;
  }): Promise<SubmitResult>;
  load(): void;
  replay(): Promise<void>;
  onFocus(): void;
  getState(): PendingSetState;
  cleanup(): void;
};

export function createPendingSetController(config: {
  storage: Storage;
  logSet: LogSetFunction;
  sessionId: string;
  sessionStatus: string;
  userId: string;
  onChange: (state: PendingSetState) => void;
  deps: PendingSetDeps;
  timer?: RetryTimer;
  addEventListener?: (type: string, handler: () => void) => void;
  removeEventListener?: (type: string, handler: () => void) => void;
}): PendingSetController {
  const { 
    storage, 
    logSet, 
    sessionId, 
    sessionStatus, 
    userId, 
    onChange, 
    deps,
    timer,
    addEventListener,
    removeEventListener,
  } = config;

  let state: PendingSetState = {
    pending: [],
    expired: false,
    retrying: false,
    error: null,
    replayed: [],
    conflicts: 0,
  };

  let replayPromise: Promise<void> | null = null;
  let replayAttempted = false;
  
  const scheduler: RetryScheduler | null = timer
    ? createRetryScheduler({
        timer,
        // Don't pass addEventListener/removeEventListener to scheduler
        // The controller handles online events directly
      })
    : null;

  // Register online event handler in the controller
  let onlineHandlerRegistered: (() => void) | null = null;
  if (addEventListener && removeEventListener) {
    onlineHandlerRegistered = () => {
      onFocus();
    };
    addEventListener('online', onlineHandlerRegistered);
  }

  function setState(partial: Partial<PendingSetState>) {
    state = { ...state, ...partial };
    onChange(state);
  }

  function load(): void {
    if (!canReplayForStatus(sessionStatus)) {
      clearPendingSets(storage, userId, sessionId, deps);
      setState({
        pending: [],
        expired: false,
        error: "Session is not in progress",
      });
      return;
    }
    
    const loaded = loadPendingSets(storage, userId, sessionId, deps);
    if (loaded.length > 0) {
      setState({
        pending: loaded,
        expired: true,
      });
    }
  }

  async function submit(set: {
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds?: number | null;
    clientId: string;
  }): Promise<SubmitResult> {
    try {
      const result = await logSet({
        sessionExerciseId: set.sessionExerciseId,
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSeconds: set.durationSeconds,
      });

      if (result.ok) {
        return { status: "saved" };
      }

      if (isSessionExpired(result)) {
        const pending: PendingSet = {
          sessionExerciseId: set.sessionExerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds ?? null,
          clientId: set.clientId,
        };
        savePendingSet(storage, userId, sessionId, pending, deps);

        const loaded = loadPendingSets(storage, userId, sessionId, deps);
        setState({
          pending: loaded,
          expired: true,
          error: null,
        });

        return { status: "expired" };
      }

      if (isDuplicateError(result)) {
        return { status: "saved" };
      }

      if ("reason" in result && result.reason === "set_exists") {
        return { status: "saved", reason: "set_exists", savedSets: result.savedSets };
      }

      const errorMessage = "error" in result ? result.error ?? "Failed to save set" : "Failed to save set";
      setState({ error: errorMessage });
      return { status: "failed", error: errorMessage };
    } catch (err) {
      if (isSessionExpired(err)) {
        const pending: PendingSet = {
          sessionExerciseId: set.sessionExerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds ?? null,
          clientId: set.clientId,
        };
        savePendingSet(storage, userId, sessionId, pending, deps);

        const loaded = loadPendingSets(storage, userId, sessionId, deps);
        setState({
          pending: loaded,
          expired: true,
          error: null,
        });

        return { status: "expired" };
      }

      if (isOfflineError(err)) {
        const pending: PendingSet = {
          sessionExerciseId: set.sessionExerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds ?? null,
          clientId: set.clientId,
        };
        savePendingSet(storage, userId, sessionId, pending, deps);

        const loaded = loadPendingSets(storage, userId, sessionId, deps);
        setState({
          pending: loaded,
          expired: false,
          error: null,
        });

        return { status: "queued" };
      }

      const message = err instanceof Error ? err.message : "Network error";
      setState({ error: message });
      return { status: "failed", error: message };
    }
  }

  async function replay(): Promise<void> {
    if (replayPromise) {
      return replayPromise;
    }

    if (replayAttempted && state.pending.length === 0) {
      return;
    }

    if (!canReplayForStatus(sessionStatus)) {
      if (scheduler) {
        scheduler.reset();
      }
      clearPendingSets(storage, userId, sessionId, deps);
      setState({
        pending: [],
        expired: false,
        retrying: false,
        error: "Session is not in progress",
      });
      return;
    }

    replayPromise = (async () => {
      replayAttempted = true;

      const toReplay = loadPendingSets(storage, userId, sessionId, deps);
      if (toReplay.length === 0) {
        if (scheduler) {
          scheduler.reset();
        }
        setState({
          pending: [],
          expired: false,
          retrying: false,
        });
        return;
      }

      setState({ retrying: true, error: null });

      let firstError: string | null = null;
      const successfullyReplayed: PendingSet[] = [];
      let conflictCount = 0;
      let authFailed = false;

      for (const set of toReplay) {
        try {
          const result = await logSet({
            sessionExerciseId: set.sessionExerciseId,
            setNumber: set.setNumber,
            reps: set.reps,
            weightKg: set.weightKg,
            durationSeconds: set.durationSeconds,
          });

          if (result.ok || isDuplicateError(result)) {
            clearPendingSet(storage, userId, sessionId, set.clientId, deps);
            successfullyReplayed.push(set);
          } else if ("reason" in result && result.reason === "set_exists") {
            // Conflict: set number already recorded with different values
            clearPendingSet(storage, userId, sessionId, set.clientId, deps);
            conflictCount += 1;
          } else if (isSessionExpired(result)) {
            if (!firstError) firstError = "Session still expired";
            authFailed = true;
          } else {
            const errorMessage = "error" in result ? result.error ?? "Failed to replay set" : "Failed to replay set";
            if (!firstError) firstError = errorMessage;
          }
        } catch (err) {
          if (isDuplicateError(err)) {
            clearPendingSet(storage, userId, sessionId, set.clientId, deps);
            successfullyReplayed.push(set);
          } else if (isSessionExpired(err)) {
            if (!firstError) firstError = "Session still expired";
            authFailed = true;
          } else if (isOfflineError(err)) {
            if (!firstError) firstError = "Still offline";
          } else if (!firstError) {
            firstError = err instanceof Error ? err.message : "Network error";
          }
        }
      }

      const remaining = loadPendingSets(storage, userId, sessionId, deps);
      
      setState({
        pending: remaining,
        expired: remaining.length > 0 && authFailed,
        retrying: false,
        error: firstError,
        replayed: successfullyReplayed,
        conflicts: conflictCount,
      });
      
      if (remaining.length > 0 && scheduler) {
        scheduler.scheduleRetry(() => {
          replayPromise = null;
          replay();
        });
      } else if (scheduler) {
        scheduler.reset();
      }
    })();

    await replayPromise;
    replayPromise = null;
  }

  function onFocus(): void {
    const loaded = loadPendingSets(storage, userId, sessionId, deps);
    if (loaded.length > 0) {
      setState({
        pending: loaded,
      });
      if (scheduler) {
        scheduler.reset();
      }
      replay();
    }
  }

  function getState(): PendingSetState {
    return state;
  }

  function cleanup(): void {
    if (scheduler) {
      scheduler.cleanup();
    }
    if (onlineHandlerRegistered && removeEventListener) {
      removeEventListener('online', onlineHandlerRegistered);
    }
  }

  return {
    submit,
    load,
    replay,
    onFocus,
    getState,
    cleanup,
  };
}
